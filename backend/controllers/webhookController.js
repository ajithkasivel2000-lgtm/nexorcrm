const prisma = require('../prismaClient');
const tenant = require('../utils/tenant');
const { verifyMetaSignature, lastTen, GRAPH } = require('../utils/whatsapp');
const { verifyCallbackSignature } = require('../utils/exotel');
const { intakeLead, IntakeError } = require('../utils/leadIntake');
const { notify } = require('./notificationController');
const { sendToUser } = require('../utils/push');

/**
 * Inbound webhooks from Meta, Google and Exotel.
 *
 * None of these callers can sign in, so each one is identified from its
 * payload — the WhatsApp phone-number id, the Facebook page id, the Google
 * integration key, the CallLog id — and verified (Meta's signature, Google's
 * key, our own HMAC for Exotel) before anything is written. Every request
 * then runs inside the company it belongs to (utils/tenant.js).
 *
 *   GET  /api/webhooks/meta                 subscription check (hub.challenge)
 *   POST /api/webhooks/meta                 WhatsApp messages/statuses + Lead Ads
 *   POST /api/webhooks/google-leads/:key    Google Ads lead form
 *   POST /api/webhooks/exotel/:callId       call outcome
 */

/* ---------------------------------------------------------------- Meta --- */

/** Meta's one-time subscription check: echo the challenge if the token is ours. */
exports.metaVerify = (req, res) => tenant.runAsSystem(async () => {
  const mode = req.query['hub.mode'];
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = req.query['hub.challenge'];
  if (mode !== 'subscribe' || !token) return res.sendStatus(403);
  const platformToken = process.env.META_VERIFY_TOKEN;
  const match = (platformToken && token === platformToken)
    || await prisma.whatsAppSetting.findFirst({ where: { verifyToken: token } });
  return match ? res.status(200).send(String(challenge)) : res.sendStatus(403);
});

/** Which app secret signs this payload: the company's own, or the platform's. */
const appSecretFor = (settings) => settings?.appSecret || process.env.META_APP_SECRET || '';

async function handleWhatsAppChange(value, rawBody, signature) {
  const phoneNumberId = value?.metadata?.phone_number_id;
  if (!phoneNumberId) return;
  const settings = await tenant.runAsSystem(() => prisma.whatsAppSetting.findFirst({ where: { phoneNumberId: String(phoneNumberId) } }));
  if (!settings) return;
  if (!verifyMetaSignature(rawBody, signature, appSecretFor(settings))) {
    console.warn(`WhatsApp webhook for ${phoneNumberId} failed signature check; ignored.`);
    return;
  }

  await tenant.runWithCompany(settings.companyId, async () => {
    // Delivery receipts for messages we sent.
    for (const status of value.statuses || []) {
      await prisma.whatsAppMessage.updateMany({
        where: { waMessageId: String(status.id) },
        data: {
          status: String(status.status || 'sent'),
          error: status.errors?.[0]?.title ? String(status.errors[0].title).slice(0, 500) : undefined,
        },
      });
    }

    // Messages from customers.
    for (const msg of value.messages || []) {
      const phone = String(msg.from || '');
      const text = msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title
        || (msg.type ? `[${msg.type}]` : '');
      const exists = msg.id && await prisma.whatsAppMessage.findUnique({ where: { waMessageId: String(msg.id) } });
      if (exists) continue; // Meta retries; store each message once.

      const ten = lastTen(phone);
      const lead = ten
        ? await prisma.lead.findFirst({ where: { mobile: { endsWith: ten } }, orderBy: { createdAt: 'desc' } })
        : null;
      await prisma.whatsAppMessage.create({
        data: {
          leadId: lead?.id || null, direction: 'in', phone, body: String(text).slice(0, 4096),
          waMessageId: msg.id ? String(msg.id) : null, status: 'received',
        },
      });
      if (lead) {
        await prisma.leadLog.create({
          data: { leadId: lead.id, title: 'WhatsApp received', subtitle: String(text).slice(0, 500), actor: 'customer', date: new Date() },
        }).catch(() => {});
        const ownerId = lead.ownerId || null;
        if (ownerId) {
          const title = `WhatsApp from ${lead.name || phone}`;
          const url = `/leads/${lead.id}`;
          await notify(ownerId, { title, body: String(text).slice(0, 140), url, kind: 'whatsapp' });
          sendToUser(ownerId, { title, body: String(text).slice(0, 140), url, tag: `wa-${lead.id}` }).catch(() => {});
        }
      }
    }
  });
}

async function handleLeadgenChange(value, rawBody, signature) {
  const pageId = value?.page_id ? String(value.page_id) : null;
  const leadgenId = value?.leadgen_id ? String(value.leadgen_id) : null;
  if (!pageId || !leadgenId) return;
  const integration = await tenant.runAsSystem(() => prisma.leadIntegration.findFirst({ where: { provider: 'facebook', pageId } }));
  if (!integration || !integration.enabled) return;

  await tenant.runWithCompany(integration.companyId, async () => {
    const wa = await prisma.whatsAppSetting.findFirst();
    if (!verifyMetaSignature(rawBody, signature, appSecretFor(wa))) {
      console.warn(`Lead Ads webhook for page ${pageId} failed signature check; ignored.`);
      return;
    }
    try {
      // The webhook only names the lead; its answers are fetched with the page token.
      const res = await fetch(`${GRAPH}/${leadgenId}?access_token=${encodeURIComponent(integration.pageAccessToken || '')}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
      const fields = Object.fromEntries((body.field_data || []).map((f) => [String(f.name).toLowerCase(), (f.values || [])[0]]));
      const name = fields.full_name || [fields.first_name, fields.last_name].filter(Boolean).join(' ') || 'Facebook lead';
      const extra = Object.entries(fields)
        .filter(([k]) => !['full_name', 'first_name', 'last_name', 'email', 'phone_number'].includes(k))
        .map(([k, v]) => `${k}: ${v}`).join('\n');
      await intakeLead({
        name,
        mobile: fields.phone_number,
        email: fields.email,
        project: integration.project,
        primarySource: integration.primarySource || 'Digital Marketing',
        secondarySource: 'Facebook',
        notes: [`Facebook Lead Ads (form ${value.form_id || '?'}, ad ${value.ad_id || '?'})`, extra].filter(Boolean).join('\n'),
        creator: 'Facebook Lead Ads',
        logSubtitle: `via ${integration.name}`,
      });
      await prisma.leadIntegration.update({
        where: { id: integration.id },
        data: { leadsReceived: { increment: 1 }, lastLeadAt: new Date(), lastError: null },
      });
    } catch (error) {
      console.error(`Facebook lead ${leadgenId} could not be imported:`, error.message);
      await prisma.leadIntegration.update({
        where: { id: integration.id },
        data: { lastError: String(error.message).slice(0, 500) },
      }).catch(() => {});
    }
  });
}

/** Everything Meta posts. Answers 200 quickly; Meta retries anything else. */
exports.metaEvent = async (req, res) => {
  res.sendStatus(200);
  const signature = req.headers['x-hub-signature-256'];
  const rawBody = req.rawBody;
  try {
    for (const entry of req.body?.entry || []) {
      for (const change of entry.changes || []) {
        if (req.body.object === 'whatsapp_business_account' && change.field === 'messages') {
          await handleWhatsAppChange(change.value, rawBody, signature);
        } else if (req.body.object === 'page' && change.field === 'leadgen') {
          await handleLeadgenChange(change.value, rawBody, signature);
        }
      }
    }
  } catch (error) {
    console.error('Meta webhook processing failed:', error.message);
  }
};

/* -------------------------------------------------------------- Google --- */

/**
 * Google Ads lead form webhook. Set up in Google Ads with this URL and the
 * same key as "Key"; Google sends it back as google_key, which is checked.
 */
exports.googleLead = (req, res) => tenant.runAsSystem(async () => {
  const key = String(req.params.key || '');
  const integration = key
    ? await prisma.leadIntegration.findFirst({ where: { provider: 'google', webhookKey: key } })
    : null;
  if (!integration || !integration.enabled || String(req.body?.google_key || '') !== key) {
    return res.status(403).json({ message: 'Unknown or disabled lead form.' });
  }

  return tenant.runWithCompany(integration.companyId, async () => {
    const columns = Object.fromEntries((req.body.user_column_data || [])
      .map((c) => [String(c.column_id || c.column_name || '').toUpperCase(), c.string_value]));
    const name = columns.FULL_NAME || [columns.FIRST_NAME, columns.LAST_NAME].filter(Boolean).join(' ') || 'Google lead';
    if (req.body.is_test) {
      return res.status(200).json({ message: 'Test lead received.' });
    }
    try {
      const lead = await intakeLead({
        name,
        mobile: columns.PHONE_NUMBER,
        email: columns.EMAIL,
        project: integration.project,
        primarySource: integration.primarySource || 'Digital Marketing',
        secondarySource: 'Google Ads',
        notes: `Google Ads lead form (campaign ${req.body.campaign_id || '?'}, form ${req.body.form_id || '?'})`,
        creator: 'Google Ads',
        logSubtitle: `via ${integration.name}`,
      });
      await prisma.leadIntegration.update({
        where: { id: integration.id },
        data: { leadsReceived: { increment: 1 }, lastLeadAt: new Date(), lastError: null },
      });
      return res.status(200).json({ leadId: lead.id });
    } catch (error) {
      await prisma.leadIntegration.update({
        where: { id: integration.id },
        data: { lastError: String(error.message).slice(0, 500) },
      }).catch(() => {});
      const status = error instanceof IntakeError ? 400 : 500;
      return res.status(status).json({ message: error.message });
    }
  });
});

/* -------------------------------------------------------------- Exotel --- */

const EXOTEL_STATES = {
  completed: 'completed', busy: 'busy', 'no-answer': 'no-answer', failed: 'failed', canceled: 'failed',
};

exports.exotelStatus = (req, res) => tenant.runAsSystem(async () => {
  const callId = String(req.params.callId || '');
  if (!verifyCallbackSignature(callId, req.query.sig)) return res.sendStatus(403);
  const call = await prisma.callLog.findUnique({ where: { id: callId } });
  if (!call) return res.sendStatus(404);

  const b = req.body || {};
  const status = String(b.Status || b.status || '').toLowerCase();
  const duration = parseInt(b.ConversationDuration ?? b.DialCallDuration ?? b.Duration ?? '', 10);
  await prisma.callLog.update({
    where: { id: call.id },
    data: {
      status: EXOTEL_STATES[status] || status || call.status,
      durationSec: Number.isFinite(duration) ? duration : call.durationSec,
      recordingUrl: b.RecordingUrl || call.recordingUrl,
      endedAt: new Date(),
    },
  });
  if (call.leadId) {
    await tenant.runWithCompany(call.companyId, () => prisma.leadLog.create({
      data: {
        leadId: call.leadId,
        title: `Call ${EXOTEL_STATES[status] || status || 'ended'}`,
        subtitle: Number.isFinite(duration) && duration > 0 ? `${Math.round(duration / 60 * 10) / 10} min` : null,
        actor: 'system',
        date: new Date(),
      },
    })).catch(() => {});
  }
  return res.sendStatus(200);
});

/* ------------------------------------------- Razorpay (buyer payments) --- */

/**
 * POST /api/webhooks/razorpay-payments/:companyId
 *
 * The company's own Razorpay account reports payment-link events here, signed
 * with the webhook secret the company saved. A paid link is recorded on the
 * booking; recording is idempotent, so Razorpay's retries are harmless.
 */
exports.razorpayPayments = async (req, res) => {
  const companyId = String(req.params.companyId || '');
  try {
    const company = await tenant.runAsSystem(() => prisma.company.findUnique({ where: { id: companyId } }));
    if (!company) return res.sendStatus(404);
    const result = await tenant.runWithCompany(companyId, async () => {
      const collections = require('../utils/collections');
      const settings = await prisma.paymentGatewaySetting.findFirst();
      if (!collections.verifyWebhookSignature(req.rawBody, req.headers['x-razorpay-signature'], settings?.webhookSecret)) return 401;

      const event = req.body?.event;
      const linkEntity = req.body?.payload?.payment_link?.entity;
      if (!linkEntity?.id) return 200; // not a payment-link event: nothing to do
      const link = await prisma.paymentLink.findFirst({ where: { razorpayLinkId: linkEntity.id } });
      if (!link) return 200;

      if (event === 'payment_link.paid') {
        const payment = req.body?.payload?.payment?.entity || {};
        if (!payment.id) return 400;
        await collections.recordLinkPayment(link, { paymentId: payment.id, amountPaise: payment.amount || linkEntity.amount_paid, method: payment.method });
      } else if (event === 'payment_link.expired' || event === 'payment_link.cancelled') {
        await prisma.paymentLink.updateMany({ where: { id: link.id, status: 'created' }, data: { status: event.split('.')[1] } });
      }
      return 200;
    });
    return res.sendStatus(result);
  } catch (error) {
    console.error('Razorpay payments webhook failed:', error.message);
    return res.sendStatus(500); // Razorpay retries
  }
};
