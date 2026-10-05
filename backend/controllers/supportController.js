const prisma = require('../prismaClient');
const tenant = require('../utils/tenant');
const { sendMail } = require('../utils/mailer');
const { sendError } = require('../utils/apiError');
const { copyFields, describeCopies } = require('../utils/mailRecipients');

const TOPICS = new Set(['Workspace access', 'Login problem', 'Company link problem', 'Other']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

async function applicationOwnerEmail() {
  const configured = String(process.env.APPLICATION_OWNER_EMAIL || '').trim();
  if (configured) return EMAIL.test(configured) ? configured : null;

  const admins = await tenant.runWithCompany(tenant.DEFAULT_COMPANY_ID, () =>
    prisma.user.findMany({
      where: {
        OR: [{ status: 'superadmin' }, { username: 'admin' }],
        email: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      select: { email: true },
    }));
  return admins
    .map((admin) => String(admin.email || '').trim())
    .find((email) => EMAIL.test(email)) || null;
}

exports.submit = (req, res) => tenant.runAsSystem(async () => {
  const body = req.body || {};
  if (String(body.website || '').trim()) return res.status(200).json({ message: 'Your support request was received.' });

  const email = String(body.email || '').trim();
  const topic = String(body.topic || '').trim();
  const message = String(body.message || '').trim();
  const companySlug = String(body.companySlug || '').trim();

  if (!EMAIL.test(email) || email.length > 254) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  if (!TOPICS.has(topic)) return res.status(400).json({ message: 'Choose a support topic.' });
  if (!message || message.length > 5000) {
    return res.status(400).json({ message: 'Enter a message of up to 5,000 characters.' });
  }
  if (companySlug.length > 100 || !/^[a-z0-9_-]*$/i.test(companySlug)) {
    return res.status(400).json({ message: 'The company link details are invalid. Refresh the page and try again.' });
  }

  try {
    const recipient = await applicationOwnerEmail();
    if (!recipient) {
      return res.status(503).json({ message: 'Support email is not configured. Please try again later.' });
    }
    const mailSettings = await tenant.runWithCompany(tenant.DEFAULT_COMPANY_ID, () =>
      prisma.mailSetting.findFirst({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }));
    if (!mailSettings?.enabled || !mailSettings.smtpHost) {
      return res.status(503).json({ message: 'Support email delivery is not enabled. Please try again later.' });
    }
    const { fields, cc, bcc, skipped } = copyFields(mailSettings, recipient);
    if (skipped.length) {
      console.warn(`[support] Ignored ${skipped.length} invalid default CC/BCC recipient(s).`);
    }

    const details = [
      `<p><strong>Topic:</strong> ${escapeHtml(topic)}</p>`,
      `<p><strong>From:</strong> ${escapeHtml(email)}</p>`,
      companySlug ? `<p><strong>Company link:</strong> ${escapeHtml(companySlug)}</p>` : '',
      `<p><strong>Message:</strong></p><p>${escapeHtml(message).replace(/\r?\n/g, '<br>')}</p>`,
    ].filter(Boolean).join('\n');
    const result = await sendMail({
      to: recipient,
      ...fields,
      subject: `Workspace support request: ${topic}`,
      html: `<h2>Workspace support request</h2>${details}`,
      category: 'workspace-support',
    }, { companyId: tenant.DEFAULT_COMPANY_ID });

    if (result.status === 'skipped') {
      return res.status(503).json({ message: 'Support email is temporarily unavailable. Please try again later.' });
    }
    return res.status(200).json({
      message: result.status === 'queued'
        ? `Your request was received and queued for delivery${describeCopies(cc, bcc)}.`
        : `Your support request was sent${describeCopies(cc, bcc)}.`,
    });
  } catch (error) {
    sendError(res, error, 'Could not send the support request', 503);
  }
});
