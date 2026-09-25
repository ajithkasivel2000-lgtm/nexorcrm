const crypto = require('crypto');
const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { GRAPH } = require('../utils/whatsapp');

/**
 * Settings → Integrations: the company's WhatsApp number, its Exotel account,
 * and its automatic lead sources. Administrators only (see the routes).
 *
 * Secrets (access tokens, app secret, API token) are never sent back to the
 * browser — the form shows whether each is set, and a blank field on save
 * keeps the stored value, the same as the SMTP password.
 */

const SECRET_FIELDS = {
  whatsApp: ['accessToken', 'appSecret'],
  exotel: ['apiToken'],
};

const hide = (row, fields) => {
  if (!row) return row;
  const out = { ...row };
  for (const f of fields) { out[`${f}Set`] = Boolean(row[f]); out[f] = ''; }
  return out;
};

async function singleton(model) {
  return (await prisma[model].findFirst()) || prisma[model].create({ data: {} });
}

function pick(body, allowed, secrets) {
  const data = {};
  for (const key of allowed) {
    if (body?.[key] === undefined) continue;
    if (secrets.includes(key) && !body[key]) continue; // blank = keep the stored secret
    data[key] = typeof body[key] === 'string' ? body[key].trim() : body[key];
  }
  return data;
}

/* ------------------------------------------------------------ WhatsApp --- */

exports.getWhatsApp = async (_req, res) => {
  try {
    res.status(200).json(hide(await singleton('whatsAppSetting'), SECRET_FIELDS.whatsApp));
  } catch (error) { sendError(res, error, 'Could not load WhatsApp settings', 500); }
};

exports.updateWhatsApp = async (req, res) => {
  try {
    const row = await singleton('whatsAppSetting');
    const data = pick(req.body, ['enabled', 'phoneNumberId', 'businessId', 'accessToken', 'appSecret', 'verifyToken'], SECRET_FIELDS.whatsApp);
    if (data.verifyToken === '') delete data.verifyToken;
    if (!row.verifyToken && !data.verifyToken) data.verifyToken = crypto.randomBytes(16).toString('hex');
    const saved = await prisma.whatsAppSetting.update({ where: { id: row.id }, data });
    res.status(200).json(hide(saved, SECRET_FIELDS.whatsApp));
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ message: 'That WhatsApp number is already connected to another company.' });
    sendError(res, error, 'Could not save WhatsApp settings', 400);
  }
};

/** Ask Meta about the configured number, to prove the token and id work. */
exports.testWhatsApp = async (_req, res) => {
  try {
    const s = await prisma.whatsAppSetting.findFirst();
    if (!s?.phoneNumberId || !s?.accessToken) return res.status(400).json({ message: 'Save a phone number id and access token first.' });
    const r = await fetch(`${GRAPH}/${s.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, {
      headers: { Authorization: `Bearer ${s.accessToken}` },
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(400).json({ message: `Meta says: ${body?.error?.message || r.status}` });
    res.status(200).json({ message: `Connected: ${body.verified_name || ''} ${body.display_phone_number || ''}`.trim(), details: body });
  } catch (error) { sendError(res, error, 'Could not reach Meta', 502); }
};

/* -------------------------------------------------------------- Exotel --- */

exports.getExotel = async (_req, res) => {
  try {
    res.status(200).json(hide(await singleton('exotelSetting'), SECRET_FIELDS.exotel));
  } catch (error) { sendError(res, error, 'Could not load Exotel settings', 500); }
};

exports.updateExotel = async (req, res) => {
  try {
    const row = await singleton('exotelSetting');
    const data = pick(req.body, ['enabled', 'accountSid', 'apiKey', 'apiToken', 'subdomain', 'callerId'], SECRET_FIELDS.exotel);
    const saved = await prisma.exotelSetting.update({ where: { id: row.id }, data });
    res.status(200).json(hide(saved, SECRET_FIELDS.exotel));
  } catch (error) { sendError(res, error, 'Could not save Exotel settings', 400); }
};

/* ------------------------------------------------------- Lead sources --- */

const INTEGRATION_FIELDS = ['provider', 'name', 'enabled', 'pageId', 'pageAccessToken', 'project', 'primarySource'];

exports.listLeadIntegrations = async (_req, res) => {
  try {
    const rows = await prisma.leadIntegration.findMany({ orderBy: { createdAt: 'asc' } });
    res.status(200).json(rows.map((r) => hide(r, ['pageAccessToken'])));
  } catch (error) { sendError(res, error, 'Could not load lead sources', 500); }
};

exports.createLeadIntegration = async (req, res) => {
  try {
    const data = pick(req.body, INTEGRATION_FIELDS, []);
    if (!['facebook', 'google'].includes(data.provider)) return res.status(400).json({ message: 'Provider must be facebook or google.' });
    if (!data.name) return res.status(400).json({ message: 'Give this lead source a name.' });
    if (data.provider === 'facebook' && (!data.pageId || !data.pageAccessToken)) {
      return res.status(400).json({ message: 'A Facebook lead source needs the page id and a page access token.' });
    }
    if (data.provider === 'google') {
      data.webhookKey = crypto.randomBytes(18).toString('hex');
      delete data.pageId; delete data.pageAccessToken;
    }
    const row = await prisma.leadIntegration.create({ data });
    res.status(201).json(hide(row, ['pageAccessToken']));
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ message: 'That Facebook page is already connected (possibly to another company).' });
    sendError(res, error, 'Could not create the lead source', 400);
  }
};

exports.updateLeadIntegration = async (req, res) => {
  try {
    const data = pick(req.body, ['name', 'enabled', 'pageAccessToken', 'project', 'primarySource'], ['pageAccessToken']);
    const row = await prisma.leadIntegration.update({ where: { id: req.params.id }, data });
    res.status(200).json(hide(row, ['pageAccessToken']));
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Lead source not found' });
    sendError(res, error, 'Could not update the lead source', 400);
  }
};

exports.deleteLeadIntegration = async (req, res) => {
  try {
    await prisma.leadIntegration.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Lead source removed' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Lead source not found' });
    sendError(res, error, 'Could not remove the lead source', 400);
  }
};

/* -------------------------------------------------- Scheduled reports --- */

const { sendReport, nextRunAfter } = require('../utils/scheduledReports');

exports.listReports = async (_req, res) => {
  try {
    res.status(200).json(await prisma.scheduledReport.findMany({ orderBy: { createdAt: 'asc' } }));
  } catch (error) { sendError(res, error, 'Could not load scheduled reports', 500); }
};

function reportData(body) {
  const data = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.type !== undefined) {
    if (!['pipeline', 'collections', 'activity', 'custom'].includes(body.type)) throw Object.assign(new Error('Unknown report type.'), { status: 400 });
    data.type = body.type;
  }
  if (body.savedReportId !== undefined) {
    data.savedReportId = body.savedReportId || null;
  }
  if (body.frequency !== undefined) {
    if (!['daily', 'weekly', 'monthly'].includes(body.frequency)) throw Object.assign(new Error('Unknown frequency.'), { status: 400 });
    data.frequency = body.frequency;
    data.nextRunAt = nextRunAfter(body.frequency);
  }
  if (body.recipients !== undefined) {
    const list = (Array.isArray(body.recipients) ? body.recipients : String(body.recipients).split(','))
      .map((s) => String(s).trim()).filter(Boolean);
    if (list.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) throw Object.assign(new Error('One of the recipients is not an email address.'), { status: 400 });
    data.recipients = list;
  }
  if (body.enabled !== undefined) data.enabled = Boolean(body.enabled);
  return data;
}

exports.createReport = async (req, res) => {
  try {
    const data = reportData(req.body || {});
    if (!data.name) return res.status(400).json({ message: 'Give the report a name.' });
    if (!data.recipients?.length) return res.status(400).json({ message: 'Add at least one recipient.' });
    if (!data.nextRunAt) data.nextRunAt = nextRunAfter(data.frequency || 'weekly');
    res.status(201).json(await prisma.scheduledReport.create({ data }));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    sendError(res, error, 'Could not create the report', 400);
  }
};

exports.updateReport = async (req, res) => {
  try {
    res.status(200).json(await prisma.scheduledReport.update({ where: { id: req.params.id }, data: reportData(req.body || {}) }));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (error.code === 'P2025') return res.status(404).json({ message: 'Report not found' });
    sendError(res, error, 'Could not update the report', 400);
  }
};

exports.deleteReport = async (req, res) => {
  try {
    await prisma.scheduledReport.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Report removed' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Report not found' });
    sendError(res, error, 'Could not remove the report', 400);
  }
};

exports.sendReportNow = async (req, res) => {
  try {
    const report = await prisma.scheduledReport.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ message: 'Report not found' });
    const result = await sendReport(report);
    res.status(200).json({ message: result.status === 'sent' ? 'Report sent.' : `Report ${result.status}: ${result.error || ''}`.trim() });
  } catch (error) { sendError(res, error, 'Could not send the report', 500); }
};

/* ---------------------------------------------------------- Email log --- */

exports.emailLog = async (req, res) => {
  try {
    const where = req.query.status ? { status: String(req.query.status) } : {};
    const rows = await prisma.emailOutbox.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 200,
      select: { id: true, to: true, subject: true, category: true, status: true, attempts: true, lastError: true, createdAt: true, sentAt: true },
    });
    res.status(200).json(rows);
  } catch (error) { sendError(res, error, 'Could not load the email log', 500); }
};

/* ------------------------------------------- Buyer payments & reminders --- */

const GATEWAY_SECRETS = ['keySecret', 'webhookSecret'];

/** The buyer portal's address: the company's own domain, or ?company= on the platform's. */
async function portalUrlFor(companyId, base) {
  const company = await require('../utils/tenant').runAsSystem(() => prisma.company.findUnique({ where: { id: companyId } }));
  if (company?.customDomain) return `https://${company.customDomain}/portal`;
  return `${base}/portal?company=${encodeURIComponent(company?.slug || '')}`;
}

exports.getBuyerPayments = async (_req, res) => {
  try {
    const [gateway, reminders] = await Promise.all([singleton('paymentGatewaySetting'), singleton('collectionReminderSetting')]);
    const base = String(process.env.APP_URL || '').replace(/\/+$/, '');
    res.status(200).json({
      gateway: hide(gateway, GATEWAY_SECRETS),
      reminders,
      webhookUrl: `${base}/api/webhooks/razorpay-payments/${gateway.companyId}`,
      portalUrl: await portalUrlFor(gateway.companyId, base),
    });
  } catch (error) { sendError(res, error, 'Could not load buyer payment settings', 500); }
};

exports.updateBuyerPayments = async (req, res) => {
  try {
    const gateway = await singleton('paymentGatewaySetting');
    const reminders = await singleton('collectionReminderSetting');
    if (req.body?.gateway) {
      const data = pick(req.body.gateway, ['enabled', 'keyId', 'keySecret', 'webhookSecret'], GATEWAY_SECRETS);
      const next = { ...gateway, ...data };
      if (next.enabled && (!next.keyId || !next.keySecret)) return res.status(400).json({ message: 'Enter the Razorpay key id and key secret to turn on online payments.' });
      await prisma.paymentGatewaySetting.update({ where: { id: gateway.id }, data });
    }
    if (req.body?.reminders) {
      const data = pick(req.body.reminders, ['enabled', 'email', 'whatsapp', 'whatsappTemplate', 'whatsappLanguage', 'includePayLink'], []);
      const r = req.body.reminders;
      if (r.daysBefore !== undefined) {
        const days = [].concat(r.daysBefore).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 90);
        data.daysBefore = [...new Set(days)].sort((a, b) => b - a);
      }
      if (r.overdueEveryDays !== undefined) data.overdueEveryDays = Math.min(60, Math.max(1, Number(r.overdueEveryDays) || 7));
      if (r.maxOverdue !== undefined) data.maxOverdue = Math.min(20, Math.max(0, Number(r.maxOverdue) || 0));
      if (data.whatsapp && !(data.whatsappTemplate ?? reminders.whatsappTemplate)) {
        return res.status(400).json({ message: 'WhatsApp reminders need an approved template name.' });
      }
      await prisma.collectionReminderSetting.update({ where: { id: reminders.id }, data });
    }
    return exports.getBuyerPayments(req, res);
  } catch (error) { sendError(res, error, 'Could not save buyer payment settings', 400); }
};

/** Recent reminders, for the settings screen. */
exports.reminderLog = async (_req, res) => {
  try {
    res.status(200).json(await prisma.collectionReminderLog.findMany({ orderBy: { sentAt: 'desc' }, take: 100 }));
  } catch (error) { sendError(res, error, 'Could not load the reminder log', 500); }
};
