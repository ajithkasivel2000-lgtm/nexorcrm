const nodemailer = require('nodemailer');
const prisma = require('../prismaClient');
const { runAsSystem, currentCompanyId } = require('./tenant');

/**
 * The one way the CRM sends email.
 *
 * Each company's SMTP server comes from its Mail Settings. Every message is
 * written to EmailOutbox and tried straight away; if the server is down it
 * stays queued and the background sweep retries it with backoff — 1, 5, 30
 * minutes, then 2 and 6 hours — before giving up. Before this, a mail server
 * that was unreachable for a moment simply lost the notification.
 *
 * This replaced three hand-rolled copies of the transport setup that had
 * drifted apart (one honoured the "enabled" switch and the others did not).
 */

const RETRY_MINUTES = [1, 5, 30, 120, 360];
const MAX_ATTEMPTS = RETRY_MINUTES.length + 1;

/* SMTP TLS verifies the server's certificate by default. SMTP_ALLOW_SELF_SIGNED=true
   relaxes that — for a mail server with a self-signed certificate only — and is
   logged loudly so it cannot be set by accident. Sending over an unverified
   connection exposes the company's mail password and every message to anyone
   between the server and the mail host. */
const allowSelfSigned = () => {
  const allowed = String(process.env.SMTP_ALLOW_SELF_SIGNED || '').trim().toLowerCase() === 'true';
  if (allowed) console.warn('[mailer] SMTP_ALLOW_SELF_SIGNED=true — TLS certificates are NOT verified. Set a proper certificate on the mail server.');
  return allowed;
};
const tlsVerified = allowSelfSigned();

/** The company's mail settings and a transporter, or null when mail is off. */
async function getTransport() {
  // One row per company; oldest wins if a duplicate ever appears (see settings.js).
  const settings = await prisma.mailSetting.findFirst({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  if (!settings || settings.enabled === false || !settings.smtpHost) return null;
  const useAuth = settings.smtpAuth ? settings.smtpAuth === 'True' : Boolean(settings.smtpUsername);
  const company = await runAsSystem(() => prisma.company.findUnique({ where: { id: currentCompanyId() || '' }, select: { name: true } })).catch(() => null);
  return {
    settings,
    companyName: company?.name || null,
    transporter: nodemailer.createTransport({
      host: settings.smtpHost,
      port: Number(settings.smtpPort),
      secure: Number(settings.smtpPort) === 465,
      auth: useAuth ? { user: settings.smtpUsername, pass: settings.smtpPassword } : undefined,
      tls: settings.starttls === 'True' ? { rejectUnauthorized: tlsVerified ? false : true } : undefined,
    }),
  };
}

/* The sender's name: Mail Settings' From name, else the company's own name,
   so a customer's emails never arrive signed by the platform. */
const fromLine = (settings, companyName) =>
  `"${settings.fromName || companyName || 'NexorCRM'}" <${settings.fromEmail || settings.smtpUsername}>`;

const joinAddresses = (value) => (Array.isArray(value) ? value.filter(Boolean).join(', ') : value || null);

async function deliver(row, mail) {
  await mail.transporter.sendMail({
    from: fromLine(mail.settings, mail.companyName),
    to: row.to,
    cc: row.cc || undefined,
    bcc: row.bcc || undefined,
    subject: row.subject,
    html: row.html,
  });
}

/**
 * Send an email for the current company.
 *
 * @param {object}  message  { to, cc?, bcc?, subject, html, category? }
 * @param {object}  [opts]
 * @param {boolean} [opts.queueOnFailure=true]  false: throw on failure instead
 *   of queueing — for callers that run their own retry (site-visit notices)
 *   or must report the result (the mail-settings test button).
 * @returns {Promise<{status: 'sent'|'queued'|'skipped', id?: string, error?: string}>}
 */
async function sendMail(message, { queueOnFailure = true } = {}) {
  const to = joinAddresses(message.to);
  if (!to) return { status: 'skipped', error: 'no recipient' };

  const mail = await getTransport();
  if (!mail) {
    if (!queueOnFailure) throw new Error('Mail is not configured (Mail Settings has no SMTP host, or it is switched off).');
    return { status: 'skipped', error: 'mail not configured' };
  }

  const row = await prisma.emailOutbox.create({
    data: {
      to,
      cc: joinAddresses(message.cc),
      bcc: joinAddresses(message.bcc),
      subject: String(message.subject || '').slice(0, 500),
      html: message.html || '',
      category: message.category || null,
      status: 'queued',
      attempts: 1,
    },
  });

  try {
    await deliver(row, mail);
    await prisma.emailOutbox.update({ where: { id: row.id }, data: { status: 'sent', sentAt: new Date() } });
    return { status: 'sent', id: row.id };
  } catch (error) {
    const failedForGood = !queueOnFailure;
    await prisma.emailOutbox.update({
      where: { id: row.id },
      data: {
        status: failedForGood ? 'failed' : 'queued',
        lastError: String(error.message || error).slice(0, 500),
        nextAttemptAt: new Date(Date.now() + RETRY_MINUTES[0] * 60000),
      },
    }).catch(() => {});
    if (failedForGood) throw error;
    console.warn(`Email to ${to} queued for retry: ${error.message}`);
    return { status: 'queued', id: row.id, error: error.message };
  }
}

/**
 * Retry queued mail that is due. Called per company by the background job.
 * Claims each row by bumping its next attempt first, so two sweeps never send
 * the same message.
 */
async function retryQueuedMail({ limit = 50 } = {}) {
  const due = await prisma.emailOutbox.findMany({
    where: { status: 'queued', nextAttemptAt: { lte: new Date() }, attempts: { gt: 0 } },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
  });
  if (!due.length) return 0;
  const mail = await getTransport();
  if (!mail) return 0;

  let sent = 0;
  for (const row of due) {
    const claim = await prisma.emailOutbox.updateMany({
      where: { id: row.id, status: 'queued', attempts: row.attempts },
      data: { attempts: row.attempts + 1, nextAttemptAt: new Date(Date.now() + 10 * 60000) },
    });
    if (claim.count !== 1) continue;
    try {
      await deliver(row, mail);
      await prisma.emailOutbox.update({ where: { id: row.id }, data: { status: 'sent', sentAt: new Date(), lastError: null } });
      sent += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      await prisma.emailOutbox.update({
        where: { id: row.id },
        data: {
          status: giveUp ? 'failed' : 'queued',
          lastError: String(error.message || error).slice(0, 500),
          nextAttemptAt: new Date(Date.now() + (RETRY_MINUTES[attempts - 1] || 360) * 60000),
        },
      }).catch(() => {});
    }
  }
  return sent;
}

module.exports = { sendMail, getTransport, retryQueuedMail, fromLine };
