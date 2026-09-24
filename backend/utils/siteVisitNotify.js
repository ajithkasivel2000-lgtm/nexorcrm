/**
 * Telling people about a site visit.
 *
 * Two audiences, and they are not allowed to see the same thing:
 *
 *  - internal (super admin, admins, the lead's owner, the project's managers)
 *    get the bell, a push and an email, and may see everything.
 *  - the customer gets an email and only an email. There is no path in this
 *    file that can send a customer a push, and the only fields their message
 *    can reach are the ones `customerFields` returns — so a lead id or an
 *    internal note cannot end up in front of them by someone editing a
 *    template.
 *
 * Every message is claimed before it is sent. The claim is a row in
 * SiteVisitNotification with a unique key of (visit, event, audience, channel,
 * recipient): the second attempt cannot insert, so it cannot send. That is
 * what makes a repeated sweep, a retried request or a second server safe.
 */

const { getTransport } = require('./mailer');
const prisma = require('../prismaClient');
const { sendToUser } = require('./push');
const { notify } = require('../controllers/notificationController');
const { internalRecipients, formatVisitTime } = require('./siteVisit');
const { customerProject } = require('./projectBrochure');
const { customerEmailHtml } = require('./siteVisitEmail');

/** How many times a failed message is retried by the sweep before it rests. */
const MAX_ATTEMPTS = 3;

/** What each event is called in a subject line. */
const EVENT_TITLES = {
  scheduled: 'Site visit scheduled',
  confirmed: 'Site visit confirmed',
  rescheduled: 'Site visit rescheduled',
  cancelled: 'Site visit cancelled',
  'reminder-24h': 'Site visit tomorrow',
  'reminder-2h': 'Site visit in 2 hours',
  completed: 'Site visit completed',
  'no-show': 'Site visit — no show',
};

/**
 * The only fields a customer's message may use.
 *
 * A whitelist rather than a redaction pass: anything not named here simply is
 * not available to the customer template, so new columns on the visit cannot
 * leak by being forgotten.
 */
function customerFields(visit) {
  return {
    customerName: visit.customerName || 'there',
    projectName: visit.projectName || 'our project',
    projectAddress: visit.projectAddress || '',
    projectMapLink: visit.projectMapLink || '',
    projectContact: visit.projectContact || '',
    hostName: visit.assignedToName || '',
    when: formatVisitTime(visit.scheduledAt, visit.timezone),
    previousWhen: visit.previousAt ? formatVisitTime(visit.previousAt, visit.timezone) : '',
    note: visit.customerNote || '',
  };
}

/**
 * The project a visit was booked against, for the customer's brochure.
 *
 * Looked up from the visit rather than passed in, so the retry path — which
 * only has the stored notification row — rebuilds exactly the same email as
 * the first attempt instead of falling back to a plainer one.
 */
async function projectForVisit(visit) {
  const key = visit.projectId || visit.projectName;
  if (!key) return null;
  return prisma.project.findFirst({
    where: { OR: [{ id: String(key) }, { projectName: String(key) }] },
  }).catch(() => null);
}

/** The transporter the rest of the CRM uses, from the stored mail settings. */
function mailer() {
  return getTransport();
}

/**
 * Claim one message. Returns the row to send, or null if it is already taken.
 *
 * The insert is the lock. A unique violation means somebody else is sending
 * this exact message, so this caller does nothing at all.
 */
async function claim(visitId, { event, audience, channel, recipientId, recipientEmail, recipientName }) {
  const recipientKey = String(recipientId || recipientEmail || 'unknown').toLowerCase();
  try {
    return await prisma.siteVisitNotification.create({
      data: {
        siteVisitId: visitId,
        event,
        audience,
        channel,
        recipientId: recipientId || null,
        recipientEmail: recipientEmail || null,
        recipientName: recipientName || null,
        recipientKey,
        status: 'pending',
      },
    });
  } catch (error) {
    if (error.code === 'P2002') return null;    // already claimed — not an error
    console.error('Could not claim a site visit notification:', error.message);
    return null;
  }
}

const settle = (id, status, error = null) => prisma.siteVisitNotification.update({
  where: { id },
  data: {
    status,
    error: error ? String(error).slice(0, 300) : null,
    sentAt: status === 'sent' ? new Date() : null,
    attempts: { increment: 1 },
  },
}).catch(() => { });

/* ---------------------------------------------------------------------------
   Internal
   ------------------------------------------------------------------------- */

/**
 * Bell, push and email to everyone inside the business who should know.
 *
 * Each channel is attempted independently and wrapped on its own: a push
 * service being down must not stop the email, and a dead SMTP host must not
 * stop the push. That is the requirement, and it is why there is no early
 * return between them.
 */
async function notifyInternal(visit, event, details) {
  const title = EVENT_TITLES[event] || 'Site visit update';
  const body = `${visit.customerName || 'A customer'} · ${visit.projectName || 'project'} · `
    + formatVisitTime(visit.scheduledAt, visit.timezone);
  const url = `/leads/${visit.leadId}`;

  const people = await internalRecipients(details);
  const results = [];

  for (const person of people) {
    /* ---- the bell ---- */
    // eslint-disable-next-line no-await-in-loop
    const bell = await claim(visit.id, {
      event, audience: 'internal', channel: 'bell', recipientId: person.id, recipientName: person.username,
    });
    if (bell) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await notify(person.id, { title, body, url, kind: 'lead' });
        // eslint-disable-next-line no-await-in-loop
        await settle(bell.id, 'sent');
      } catch (error) {
        // eslint-disable-next-line no-await-in-loop
        await settle(bell.id, 'failed', error.message);
      }
    }

    /* ---- push ---- */
    // eslint-disable-next-line no-await-in-loop
    const push = await claim(visit.id, {
      event, audience: 'internal', channel: 'push', recipientId: person.id, recipientName: person.username,
    });
    if (push) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const out = await sendToUser(person.id, { title, body, url, tag: `visit-${visit.id}` });
        // eslint-disable-next-line no-await-in-loop
        await settle(push.id, out?.skipped ? 'skipped' : 'sent', out?.skipped || null);
      } catch (error) {
        // eslint-disable-next-line no-await-in-loop
        await settle(push.id, 'failed', error.message);
      }
    }

    /* ---- email ---- */
    if (person.email) {
      // eslint-disable-next-line no-await-in-loop
      const mail = await claim(visit.id, {
        event, audience: 'internal', channel: 'email', recipientId: person.id, recipientEmail: person.email, recipientName: person.username,
      });
      if (mail) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await sendInternalEmail(person.email, visit, event, details);
          // eslint-disable-next-line no-await-in-loop
          await settle(mail.id, 'sent');
        } catch (error) {
          // eslint-disable-next-line no-await-in-loop
          await settle(mail.id, 'failed', error.message);
        }
      }
    }

    results.push(person.username);
  }

  return results;
}

async function sendInternalEmail(to, visit, event, details) {
  const mail = await mailer();
  if (!mail) throw new Error('mail is not configured');

  const title = EVENT_TITLES[event] || 'Site visit update';
  const rows = [
    ['Customer', visit.customerName],
    ['Phone', visit.customerPhone],
    ['Email', visit.customerEmail],
    ['Project', visit.projectName],
    ['Address', visit.projectAddress],
    ['When', formatVisitTime(visit.scheduledAt, visit.timezone)],
    visit.previousAt ? ['Previously', formatVisitTime(visit.previousAt, visit.timezone)] : null,
    ['Assigned to', visit.assignedToName],
    ['Status', visit.status],
    visit.cancelReason ? ['Cancellation reason', visit.cancelReason] : null,
    visit.outcome ? ['Outcome', visit.outcome] : null,
    // Internal only, and only ever in this email.
    ['Lead', details?.internal?.leadId || visit.leadId],
    visit.note ? ['Internal note', visit.note] : null,
  ].filter(Boolean);

  await mail.transporter.sendMail({
    from: `"${mail.settings.fromName || 'NexorCRM'}" <${mail.settings.fromEmail}>`,
    to,
    subject: `${title} — ${visit.customerName || 'customer'} · ${visit.projectName || ''}`.trim(),
    html: `<div style="font-family:Arial,sans-serif;padding:20px">
      <h2 style="margin:0 0 12px">${title}</h2>
      <table style="border-collapse:collapse;max-width:640px;width:100%">
        ${rows.map(([k, v]) => `<tr>
          <td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;width:180px">${k}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(v ?? '—')}</td>
        </tr>`).join('')}
      </table>
      <p style="color:#666;font-size:12px;margin-top:16px">Sent via NexorCRM</p>
    </div>`,
  });
}

/* ---------------------------------------------------------------------------
   Customer
   ------------------------------------------------------------------------- */

/**
 * Email to the customer. Email only — this function has no push path at all.
 *
 * Builds from `customerFields`, so nothing internal is reachable even by
 * mistake: there is no lead id, no owner email, no status machine, no note
 * except the one explicitly marked as the customer's.
 */
async function notifyCustomer(visit, event, project = null) {
  if (!visit.customerEmail) return { skipped: 'the customer has no email address' };

  const row = await claim(visit.id, {
    event,
    audience: 'customer',
    channel: 'email',
    recipientEmail: visit.customerEmail,
    recipientName: visit.customerName,
  });
  if (!row) return { skipped: 'already sent' };

  try {
    const mail = await mailer();
    if (!mail) throw new Error('mail is not configured');

    const f = customerFields(visit);
    /* The brochure comes from the whitelist in projectBrochure, never from the
       project row directly, so a column added later cannot reach a customer by
       being forgotten. Null when the lead has no project, and the template then
       renders the plain visit message it always sent. */
    const brochure = customerProject(project || await projectForVisit(visit));
    await mail.transporter.sendMail({
      from: `"${mail.settings.fromName || 'NexorCRM'}" <${mail.settings.fromEmail}>`,
      to: visit.customerEmail,
      subject: customerSubject(event, f),
      html: customerEmailHtml(event, f, brochure),
    });
    await settle(row.id, 'sent');
    return { sent: true };
  } catch (error) {
    await settle(row.id, 'failed', error.message);
    return { failed: error.message };
  }
}

function customerSubject(event, f) {
  switch (event) {
    case 'cancelled': return `Your visit to ${f.projectName} has been cancelled`;
    case 'rescheduled': return `New time for your visit to ${f.projectName}`;
    case 'confirmed': return `Your visit to ${f.projectName} is confirmed`;
    case 'reminder-24h': return `Tomorrow: your visit to ${f.projectName}`;
    case 'reminder-2h': return `In 2 hours: your visit to ${f.projectName}`;
    default: return `Your visit to ${f.projectName}`;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Announce one event to both audiences.
 *
 * Internal first, then the customer, and the customer's failure is caught so a
 * bad customer address cannot swallow the team's notification (or vice versa).
 */
async function announce(visit, event, details = null) {
  const resolved = details || { owner: null, internal: { leadId: visit.leadId } };
  const out = { internal: [], customer: null };

  try {
    out.internal = await notifyInternal(visit, event, resolved);
  } catch (error) {
    console.error(`Internal site visit notification failed (${event}):`, error.message);
  }

  try {
    out.customer = await notifyCustomer(visit, event, resolved.project || null);
  } catch (error) {
    console.error(`Customer site visit notification failed (${event}):`, error.message);
    out.customer = { failed: error.message };
  }

  return out;
}

/**
 * Retry what failed.
 *
 * Only rows that failed and are under the attempt cap; a row already 'sent'
 * is never revisited, which is what keeps a retry from becoming a duplicate.
 */
async function retryFailed({ limit = 50 } = {}) {
  const stuck = await prisma.siteVisitNotification.findMany({
    where: { status: 'failed', attempts: { lt: MAX_ATTEMPTS } },
    take: limit,
    orderBy: { updatedAt: 'asc' },
  });

  let retried = 0;
  for (const row of stuck) {
    // eslint-disable-next-line no-await-in-loop
    const visit = await prisma.siteVisit.findUnique({ where: { id: row.siteVisitId } });
    if (!visit) continue;
    try {
      if (row.audience === 'customer' && row.channel === 'email') {
        const mail = await mailer();
        if (!mail) continue;
        const f = customerFields(visit);
        /* The same brochure the first attempt built. Without this a retry
           would quietly send a plainer email than the one that failed, and
           two customers would have had different messages for one event. */
        // eslint-disable-next-line no-await-in-loop
        const retryProject = await projectForVisit(visit);
        // eslint-disable-next-line no-await-in-loop
        await mail.transporter.sendMail({
          from: `"${mail.settings.fromName || 'NexorCRM'}" <${mail.settings.fromEmail}>`,
          to: row.recipientEmail,
          subject: customerSubject(row.event, f),
          html: customerEmailHtml(row.event, f, customerProject(retryProject)),
        });
      } else if (row.channel === 'email' && row.recipientEmail) {
        // eslint-disable-next-line no-await-in-loop
        await sendInternalEmail(row.recipientEmail, visit, row.event, null);
      } else if (row.channel === 'push' && row.recipientId) {
        // eslint-disable-next-line no-await-in-loop
        await sendToUser(row.recipientId, {
          title: EVENT_TITLES[row.event] || 'Site visit update',
          body: `${visit.customerName || ''} · ${visit.projectName || ''}`,
          url: `/leads/${visit.leadId}`,
          tag: `visit-${visit.id}`,
        });
      } else {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await settle(row.id, 'sent');
      retried += 1;
    } catch (error) {
      // eslint-disable-next-line no-await-in-loop
      await settle(row.id, 'failed', error.message);
    }
  }
  return retried;
}

module.exports = {
  announce,
  notifyInternal,
  notifyCustomer,
  retryFailed,
  customerFields,
  EVENT_TITLES,
  MAX_ATTEMPTS,
};
