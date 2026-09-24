/**
 * Telling a lead's owner that it is theirs.
 *
 * Three channels, in this order:
 *
 *   1. the bell     — the record, so a lead assigned while they were signed
 *                     out is still waiting for them
 *   2. push         — the announcement, which reaches a closed browser
 *   3. email        — using the "Create New Lead" template from the template
 *                     list, so the wording stays editable
 *
 * What each of them did is returned to the caller, not filed on the lead's
 * log: delivery is plumbing, and it used to bury the entries people open the
 * log to read.
 *
 * This lives here because a lead arrives four different ways — the form, the
 * website, a campaign, a CSV import — and only the form used to notify anyone.
 * The other three assigned an owner by round-robin and told them nothing.
 *
 * Nothing here throws. A lead exists whether or not the news got out, and a
 * dead SMTP host must never turn a successful create into a failed request.
 */
const { sendMail } = require('./mailer');
const prisma = require('../prismaClient');
const { sendToUser } = require('./push');
const { notify } = require('../controllers/notificationController');
const { copyFields, describeCopies } = require('./mailRecipients');

const TEMPLATE_KEY = 'CREATE_NEW_LEAD_TEMPLATE';

/**
 * The template for a lead changing hands.
 *
 * Optional on purpose. Templates are written by hand in Email Templates, not
 * seeded, so requiring this one would mean no handover email ever went out
 * until somebody happened to create it. When it is absent the wording below
 * is used instead, and the mail still arrives.
 */
const REASSIGN_TEMPLATE_KEY = 'LEAD_REASSIGNED_TEMPLATE';

/**
 * Whether `creator` names the same person as `owner`.
 *
 * The creator is recorded as whatever the form sent — a username most of the
 * time, occasionally a user id — so both are compared, case-insensitively.
 */
function isSameperson(creator, owner) {
  if (!creator || !owner) return false;
  const who = String(creator).trim().toLowerCase();
  if (!who) return false;
  return who === String(owner.username || '').toLowerCase()
    || who === String(owner.id || '').toLowerCase();
}

/** The owner of a lead, however the owner happens to be recorded. */
async function resolveOwner(lead) {
  return prisma.user.findFirst({
    where: { OR: [{ id: lead.ownerId || lead.owner }, { username: lead.owner }] },
    select: { id: true, username: true, email: true },
  });
}

/** Substitutes {PLACEHOLDER} values into a template's subject and body. */
function fillTemplate(text, replacements) {
  let out = String(text || '');
  for (const [key, value] of Object.entries(replacements)) {
    out = out.split(key).join(value);
  }
  return out;
}

/**
 * The deadline, said plainly.
 *
 * A lead that moves on without warning reads as the CRM losing it. The person
 * holding it needs three things in the first line they see: that there is a
 * clock, when it runs out, and what stops it — so the notification is
 * actionable on a phone's lock screen, not just in the office.
 *
 * Returns empty strings when there is no clock (the feature off, or a lead
 * outside the rota), so every caller can interpolate it unconditionally.
 */
function deadlineNotice(followUp) {
  if (!followUp?.dueAt) return { short: '', line: '', html: '', at: '', minutes: '' };

  const minutes = followUp.timeoutMinutes || '';
  const at = formatDeadline(followUp.dueAt);

  return {
    // For a push body, where there is room for one sentence.
    short: `Update the status within ${minutes} min or it moves to the next person.`,
    line: `Please update this lead's status by ${at}. `
      + `If there is no update within ${minutes} minutes it will be reassigned automatically `
      + 'to the next user on the project round-robin.',
    at,
    minutes,
    html: `
      <div style="margin:0 0 18px;padding:14px 16px;border:1px solid #f0b429;
                  border-left:4px solid #f0b429;border-radius:6px;background:#fffbeb">
        <p style="margin:0 0 6px;font-weight:bold;color:#8a5a00;font-size:15px">
          Action needed within ${minutes} minutes
        </p>
        <p style="margin:0;color:#5c4813;font-size:14px;line-height:1.5">
          Please open this lead and update its status by <strong>${at}</strong>.
          If it is not updated, it will be automatically reassigned to the next
          user on the project round-robin and will no longer be yours.
        </p>
      </div>`,
  };
}

/**
 * The deadline in the CRM's own timezone.
 *
 * The server may well be running in UTC while the team is not; a deadline is
 * useless if it is stated in a zone the reader has to convert from.
 */
function formatDeadline(date) {
  const zone = process.env.CRM_TIMEZONE || 'Asia/Kolkata';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: zone,
    }).format(new Date(date));
  } catch {
    return new Date(date).toISOString();
  }
}

/** The fallback body, for a template saved with no content of its own. */
function defaultBody(lead, projectName, ownerName, followUp) {
  const row = (label, value) =>
    `<tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${label}</td>`
    + `<td style="padding: 8px; border-bottom: 1px solid #eee;">${value || 'N/A'}</td></tr>`;

  return `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>New Lead Created</h2>
      ${deadlineNotice(followUp).html}
      <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
        ${row('Leads ID', lead.id)}
        ${row('Name', lead.name)}
        ${row('Mobile', lead.mobile)}
        ${row('Email', lead.email)}
        ${row('Project', projectName || lead.project)}
        ${row('Source', lead.primarySource)}
        ${row('Status', lead.status)}
        ${row('Assigned To', ownerName)}
      </table>
      <hr />
      <p style="color: #666; font-size: 12px;">Sent via NexorCRM Lead Management System</p>
    </div>
  `;
}

/** The fallback body for a lead that changed hands. */
function defaultHandoverBody(lead, projectName, ownerName, from, by, followUp) {
  const row = (label, value) =>
    `<tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${label}</td>`
    + `<td style="padding: 8px; border-bottom: 1px solid #eee;">${value || 'N/A'}</td></tr>`;

  return `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>A lead was assigned to you</h2>
      <p>${by || 'Someone'} moved this lead${from ? ` from ${from}` : ''} to you. It is now in your list.</p>
      ${deadlineNotice(followUp).html}
      <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
        ${row('Leads ID', lead.id)}
        ${row('Name', lead.name)}
        ${row('Mobile', lead.mobile)}
        ${row('Email', lead.email)}
        ${row('Project', projectName || lead.project)}
        ${row('Source', lead.primarySource)}
        ${row('Status', lead.status)}
        ${row('Previous Owner', from)}
        ${row('Assigned To', ownerName)}
        ${row('Assigned By', by)}
      </table>
      <hr />
      <p style="color: #666; font-size: 12px;">Sent via NexorCRM Lead Management System</p>
    </div>
  `;
}

/**
 * Sends the owner's email, and returns what happened in words.
 *
 * Each dead end is reported separately — SMTP off, template missing, template
 * switched off, owner has no address — because "the email didn't send" is not
 * something anyone can act on.
 */
async function sendOwnerEmail(lead, owner, { ownerName, projectName, creator, handover, followUp }) {
  const mailSettings = await prisma.mailSetting.findFirst();
  if (!mailSettings || !mailSettings.smtpHost) return 'no SMTP server configured';
  if (!mailSettings.enabled) return 'mail sending is switched off';

  // Fetched without the status filter so a switched-off template reads as
  // switched off rather than as missing — different problems, different fixes.
  const wantedKey = handover ? REASSIGN_TEMPLATE_KEY : TEMPLATE_KEY;
  const found = await prisma.emailTemplate.findFirst({ where: { templateKey: wantedKey } });

  // A handover has built-in wording, so a missing template is not a dead end.
  // A switched-off one is: somebody turned it off deliberately.
  // EmailTemplate's display-name column is `name`, not `templateName` — the
  // wrong column here always read as undefined and fell back to the raw key.
  if (found && !found.status) {
    return `the "${found.name || wantedKey}" template is switched off`;
  }
  if (!found && !handover) return 'the "Create New Lead" template is missing';

  if (!owner) return 'the lead has no owner on file';
  if (!owner.email) return `${owner.username} has no email address`;

  const replacements = {
    '{OWNER_NAME}': ownerName || owner.username || '',
    '{Leads_ID}': lead.id || '',
    /* The same value under its older name. Renaming enquiries to leads renamed
       this placeholder in the code but not in the templates, which still say
       {ENQUIRY_ID} — all five of them — so the tag was never substituted and
       went out to customers verbatim. Supplying both names fixes every saved
       template without editing any of them, and keeps working for anyone who
       has since switched to the new spelling. */
    '{ENQUIRY_ID}': lead.id || '',
    '{CUSTOMER_NAME}': lead.name || '',
    '{COMPANY_NAME}': '',
    '{PHONE}': lead.mobile || '',
    '{EMAIL}': lead.email || '',
    '{PROJECT_NAME}': projectName || lead.project || '',
    '{SOURCE}': lead.primarySource || '',
    '{LEAD_OWNER}': ownerName || '',
    '{CREATED_BY}': creator || 'admin',
    '{DATE}': lead.createdAt ? new Date(lead.createdAt).toLocaleString() : '',
    '{PREVIOUS_OWNER}': (handover && handover.from) || '',
    '{ASSIGNED_BY}': (handover && handover.by) || creator || '',
    /* So a template an administrator wrote can carry the warning too, instead
       of only the built-in fallback body having it. */
    '{RESPOND_BY}': deadlineNotice(followUp).at,
    '{RESPONSE_MINUTES}': String(deadlineNotice(followUp).minutes || ''),
    '{REASSIGNMENT_WARNING}': deadlineNotice(followUp).line,
  };

  const fallbackSubject = handover
    ? `Lead assigned to you: ${lead.name || lead.id}`
    : 'New Lead Created';
  const subject = fillTemplate((found && found.subject) || fallbackSubject, replacements);

  let body = fillTemplate((found && found.bodyContent) || '', replacements);
  if (!body.trim()) {
    body = handover
      ? defaultHandoverBody(lead, projectName, ownerName, handover.from, handover.by, followUp)
      : defaultBody(lead, projectName, ownerName, followUp);
  }

  // Wrapped so the line breaks in a plain-text template survive as HTML.
  body = `<div style="white-space: pre-line; font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">${body}</div>`;

  // The standing CC/BCC from Mail Settings, minus anyone already on the To.
  const { fields, cc, bcc, skipped } = copyFields(mailSettings, owner.email);
  if (skipped.length) {
    console.warn(`Skipped invalid CC/BCC address(es): ${skipped.join(', ')}`);
  }

  // Through the mailer: a mail server that is briefly down queues the
  // message for retry instead of losing it.
  const result = await sendMail({
    to: owner.email,
    cc: fields.cc,
    bcc: fields.bcc,
    subject,
    html: body,
    category: 'lead-notify',
  });

  if (result.status === 'queued') return `queued for retry to ${owner.email} (${result.error})`;
  if (result.status === 'skipped') return `skipped (${result.error})`;
  return `sent to ${owner.email}${describeCopies(cc, bcc)}`;
}

/**
 * Notifies a lead's owner on every channel and records the result.
 *
 * @param {object} lead                the created lead
 * @param {object} [context]
 * @param {string} [context.ownerName]   the owner's display name
 * @param {string} [context.projectName] the project's display name
 * @param {string} [context.creator]     who created the lead
 * @param {object} [context.handover]    set when an existing lead changed hands:
 *                                       { from: previous owner, by: who moved it }
 * @returns {Promise<{notification: string, push: string, email: string}>}
 */
async function notifyLeadOwner(lead, context = {}) {
  const { ownerName, projectName, creator, handover, followUp } = context;
  const delivery = { notification: 'not attempted', push: 'not attempted', email: 'not attempted' };

  let owner = null;
  try {
    owner = await resolveOwner(lead);
  } catch (error) {
    console.error('Could not resolve the lead owner:', error.message);
  }

  const notice = deadlineNotice(followUp);

  /* The title carries the deadline so it survives a lock screen, where a push
     is often truncated to the title alone — "Update within 30 min" is the part
     that has to arrive. */
  const title = notice.minutes
    ? (handover
      ? `Lead assigned to you — update within ${notice.minutes} min`
      : `New lead — update within ${notice.minutes} min`)
    : (handover ? 'A lead was assigned to you' : 'New lead assigned to you');

  const who = `${lead.name || 'A lead'}${projectName ? ` — ${projectName}` : ''}`;
  const from = handover && handover.by ? ` · from ${handover.by}` : '';
  const body = notice.short ? `${who}${from}. ${notice.short}` : `${who}${from}`;
  const url = `/leads/${lead.id}`;

  // Who to measure "their own doing" against: the person who moved the lead
  // when it changed hands, the person who entered it when it is new.
  const actedBy = handover ? handover.by : creator;

  /* Nobody needs telling about their own typing.
   *
   * When the round-robin queue hands a lead back to the person who entered it
   * — or there is no queue for that project, so the owner never changed — an
   * email and a desktop alert announce something they did seconds ago.
   *
   * `creator` is a username for a lead entered by a person, and 'Website',
   * 'Campaign' or 'Import' for one that arrived on its own; those never match
   * a user, so leads from outside are always announced. */
  if (owner && isSameperson(actedBy, owner)) {
    const did = handover ? 'took this lead themselves' : 'created this lead';
    const reason = `not sent — ${owner.username} ${did}`;
    Object.assign(delivery, { notification: reason, push: reason, email: reason });

    console.log(`Skipped notifying ${owner.username} about their own lead ${lead.id}`);
    return delivery;
  }

  /* ---- 1. the bell ------------------------------------------------------ */
  if (owner) {
    const row = await notify(owner.id, { title, body, url, kind: 'lead' });
    delivery.notification = row ? 'added to the bell' : 'could not be filed';
  } else {
    delivery.notification = 'the lead has no owner on file';
  }

  /* ---- 2. push ---------------------------------------------------------- */
  if (owner) {
    try {
      const result = await sendToUser(owner.id, { title, body, url, tag: `lead-${lead.id}` });
      delivery.push = result.skipped
        ? (result.skipped === 'no subscriptions'
          ? `${owner.username} has not turned on notifications`
          : `not sent (${result.skipped})`)
        : `sent to ${result.sent} device(s)`;
    } catch (error) {
      console.error('Failed to send lead push notification:', error.message);
      delivery.push = `failed (${error.message})`;
    }
  } else {
    delivery.push = 'the lead has no owner on file';
  }

  /* ---- 3. email --------------------------------------------------------- */
  try {
    delivery.email = await sendOwnerEmail(lead, owner, { ownerName, projectName, creator, handover, followUp });
  } catch (error) {
    console.error('Failed to send lead notification email:', error.message);
    delivery.email = `failed (${error.message})`;
  }

  /* Delivery is deliberately NOT written to the lead log. Whether an email
     left the server, whether the browser had push switched on, whether a bell
     row was inserted — that is plumbing, and it was being filed alongside the
     things people actually go to the log to find: who owns the lead, what
     stage it reached, when the visit was booked. The outcome is returned in
     `delivery` for the caller that asked, and the console line below keeps it
     debuggable. */

  console.log(`Notified owner of ${lead.id}:`, JSON.stringify(delivery));
  return delivery;
}

/**
 * Above this many leads for one person in a single import, they get one
 * summary instead of one message per lead.
 *
 * A 300-row spreadsheet would otherwise mean 300 emails to the same inbox,
 * which is both useless and enough to have the sending account rate-limited.
 */
const SUMMARY_THRESHOLD = 5;

/**
 * Notifies the owners of a batch of imported leads.
 *
 * A handful each is sent normally, with the usual templated email. A large
 * share for one person becomes a single "12 new leads" message, because that
 * is the one they will actually read.
 *
 * @param {object[]} leads  the leads that were created
 * @param {object} [context]
 * @param {string} [context.creator]     who ran the import
 * @param {(lead: object) => string} [context.projectNameFor]
 */
async function notifyImportedLeads(leads, context = {}) {
  const { creator = 'Import', projectNameFor = () => null } = context;

  const byOwner = new Map();
  for (const lead of leads || []) {
    const key = lead.ownerId || lead.owner;
    if (!key) continue;
    if (!byOwner.has(key)) byOwner.set(key, []);
    byOwner.get(key).push(lead);
  }

  for (const [, group] of byOwner) {
    if (group.length <= SUMMARY_THRESHOLD) {
      for (const lead of group) {
        await notifyLeadOwner(lead, {
          projectName: projectNameFor(lead),
          creator,
        });
      }
      continue;
    }

    const owner = await resolveOwner(group[0]).catch(() => null);
    if (!owner) continue;

    // Same rule as a single lead: whoever ran the import does not need telling
    // about rows that came back to them.
    if (isSameperson(creator, owner)) {
      console.log(`Skipped the import summary for ${owner.username} — they ran the import`);
      continue;
    }

    const title = `${group.length} new leads assigned to you`;
    const names = group.slice(0, 3).map((l) => l.name).filter(Boolean).join(', ');
    const body = names
      ? `${names}${group.length > 3 ? ` and ${group.length - 3} more` : ''}`
      : `${group.length} leads from an import`;

    await notify(owner.id, { title, body, url: '/leads', kind: 'lead' });
    await sendToUser(owner.id, { title, body, url: '/leads', tag: 'lead-import' })
      .catch((error) => console.error('Import push failed:', error.message));

    console.log(`Import summary for ${owner.username}: ${group.length} leads`);
  }
}

module.exports = { notifyLeadOwner, notifyImportedLeads, TEMPLATE_KEY, SUMMARY_THRESHOLD };
