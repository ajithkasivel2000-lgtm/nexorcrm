const crypto = require('crypto');
const prisma = require('../prismaClient');

/**
 * Exotel click-to-call.
 *
 * Exotel rings the salesperson's own phone first; when they answer it dials
 * the lead and bridges the two, from the company's ExoPhone (caller id). When
 * the call ends Exotel posts the outcome — status, duration, recording — to a
 * status callback, which fills in the CallLog row.
 *
 * The callback URL names the CallLog and carries an HMAC of its id, so nobody
 * can post a fake outcome against a call they did not place.
 */

async function getExotelSettings() {
  return prisma.exotelSetting.findFirst();
}

const secret = () => String(process.env.WEBHOOK_SECRET || process.env.ACTIVATION_SECRET || '');

/** Signature for a CallLog id, used in the status-callback URL. */
function callbackSignature(callLogId) {
  const key = secret();
  if (key.length < 16) return null;
  return crypto.createHmac('sha256', key).update(`exotel:${callLogId}`).digest('hex').slice(0, 32);
}

function verifyCallbackSignature(callLogId, sig) {
  const expected = callbackSignature(callLogId);
  if (!expected || !sig || String(sig).length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(String(sig)), Buffer.from(expected));
}

/** Digits with country code 0-prefixed the way Exotel accepts Indian numbers. */
function toExotelNumber(mobile, countryCode = '+91') {
  const digits = String(mobile || '').replace(/\D/g, '');
  if (digits.length === 10) return `0${digits}`;
  if (digits.length > 10 && String(countryCode).replace(/\D/g, '') === '91' && digits.startsWith('91')) return `0${digits.slice(-10)}`;
  return digits ? `+${digits}` : null;
}

/**
 * Start a bridged call.
 *
 * @param {object} p { agentNumber, customerNumber, statusCallback }
 * @returns {Promise<{ callSid: string, status: string }>}
 */
async function connectCall({ agentNumber, customerNumber, statusCallback }) {
  const settings = await getExotelSettings();
  if (!settings || !settings.enabled || !settings.accountSid || !settings.apiKey || !settings.apiToken || !settings.callerId) {
    throw Object.assign(new Error('Calling is not connected. An administrator can set up Exotel in Settings → Integrations.'), { status: 400 });
  }
  const form = new URLSearchParams({
    From: agentNumber,
    To: customerNumber,
    CallerId: settings.callerId,
    Record: 'true',
    TimeLimit: '3600',
  });
  if (statusCallback) {
    form.set('StatusCallback', statusCallback);
    form.append('StatusCallbackEvents[0]', 'terminal');
    form.set('StatusCallbackContentType', 'application/json');
  }
  const host = String(settings.subdomain || 'api.exotel.com').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const auth = Buffer.from(`${settings.apiKey}:${settings.apiToken}`).toString('base64');
  const res = await fetch(`https://${host}/v1/Accounts/${encodeURIComponent(settings.accountSid)}/Calls/connect.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body?.RestException?.Message || `HTTP ${res.status}`;
    throw Object.assign(new Error(`Exotel could not place the call: ${reason}`), { status: 502 });
  }
  return { callSid: body?.Call?.Sid || null, status: String(body?.Call?.Status || 'queued').toLowerCase() };
}

module.exports = {
  getExotelSettings, connectCall, toExotelNumber, callbackSignature, verifyCallbackSignature,
};
