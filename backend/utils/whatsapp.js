const crypto = require('crypto');
const prisma = require('../prismaClient');

/**
 * WhatsApp Business Cloud API (Meta), per company.
 *
 * Each company connects its own WhatsApp Business number in Settings →
 * Integrations: the phone number id, a permanent access token, and the app
 * secret that signs the webhooks Meta sends back.
 *
 * Meta's rule worth knowing: free-form text can only be sent within 24 hours
 * of the customer's last message. Outside that window only an approved
 * template goes through, which is why sendWhatsApp takes either.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';

async function getWhatsAppSettings() {
  return prisma.whatsAppSetting.findFirst();
}

/** Digits only, with the country code, as WhatsApp wants it (9198xxxxxxxx). */
function toWaNumber(mobile, countryCode = '+91') {
  const digits = String(mobile || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `${String(countryCode || '+91').replace(/\D/g, '')}${digits}`;
  return digits;
}

/** The last 10 digits: how an incoming number is matched to a lead. */
const lastTen = (phone) => String(phone || '').replace(/\D/g, '').slice(-10);

/**
 * Send a WhatsApp message to a number.
 *
 * @param {object} msg { to, text } or { to, template, language?, params? }
 * @returns {Promise<{ waMessageId: string }>}
 */
async function sendWhatsApp(msg) {
  const settings = await getWhatsAppSettings();
  if (!settings || !settings.enabled || !settings.phoneNumberId || !settings.accessToken) {
    throw Object.assign(new Error('WhatsApp is not connected. An administrator can set it up in Settings → Integrations.'), { status: 400 });
  }
  const payload = { messaging_product: 'whatsapp', to: msg.to };
  if (msg.template) {
    payload.type = 'template';
    payload.template = {
      name: msg.template,
      language: { code: msg.language || 'en' },
      ...(Array.isArray(msg.params) && msg.params.length
        ? { components: [{ type: 'body', parameters: msg.params.map((text) => ({ type: 'text', text: String(text) })) }] }
        : {}),
    };
  } else {
    if (!msg.text || !String(msg.text).trim()) throw Object.assign(new Error('Message text is required.'), { status: 400 });
    payload.type = 'text';
    payload.text = { body: String(msg.text).slice(0, 4096), preview_url: true };
  }

  const res = await fetch(`${GRAPH}/${settings.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${settings.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body?.error?.error_user_msg || body?.error?.message || `HTTP ${res.status}`;
    // 131047: outside the 24-hour window — the one error people need explained.
    const hint = body?.error?.code === 131047
      ? ' The customer has not messaged in the last 24 hours, so only an approved template can be sent.'
      : '';
    throw Object.assign(new Error(`WhatsApp refused the message: ${reason}.${hint}`), { status: 502 });
  }
  return { waMessageId: body?.messages?.[0]?.id || null };
}

/**
 * Meta signs every webhook with the app secret (X-Hub-Signature-256 over the
 * raw body). A webhook that does not verify is dropped: without this anyone
 * could post fake "incoming messages" into a lead's history.
 */
function verifyMetaSignature(rawBody, header, appSecret) {
  if (!rawBody || !header || !appSecret) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(String(header));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { sendWhatsApp, getWhatsAppSettings, toWaNumber, lastTen, verifyMetaSignature, GRAPH };
