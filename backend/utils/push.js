/**
 * Web Push delivery.
 *
 * A notification goes to every browser a person has opted in from, so someone
 * signed in on a laptop and a phone is told on both. Delivery is best-effort:
 * a lead must still be created even if the push service is unreachable, so
 * nothing in here is allowed to throw into a request handler.
 *
 * Keys live in .env as VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY. Regenerating them
 * invalidates every existing subscription, which is why they are generated
 * once and left alone.
 */
const webpush = require('web-push');
const prisma = require('../prismaClient');

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@nexorcrm.local';

const configured = Boolean(PUBLIC_KEY && PRIVATE_KEY);
if (configured) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
} else {
  console.warn('Web Push is not configured: VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are missing from .env.');
}

/** Whether push can be sent at all. Routes use this to answer honestly. */
const isPushConfigured = () => configured;

/** The key a browser needs to subscribe. Public by design. */
const publicKey = () => PUBLIC_KEY;

/**
 * A subscription the push service has rejected for good.
 *
 * 404 and 410 mean the browser threw the subscription away — the user cleared
 * site data, or uninstalled. Those rows are dead and are removed, otherwise
 * every later send retries them forever.
 */
const isGone = (statusCode) => statusCode === 404 || statusCode === 410;

/**
 * Sends one notification to every device belonging to a user.
 *
 * @param {string} userId
 * @param {{title: string, body: string, url?: string, tag?: string}} payload
 * @returns {Promise<{sent: number, failed: number, removed: number, skipped?: string}>}
 */
async function sendToUser(userId, payload) {
  const result = { sent: 0, failed: 0, removed: 0 };
  if (!configured) return { ...result, skipped: 'not configured' };
  if (!userId) return { ...result, skipped: 'no user' };

  let subs;
  try {
    subs = await prisma.pushSubscription.findMany({ where: { userId } });
  } catch (error) {
    console.error('Could not read push subscriptions:', error.message);
    return { ...result, skipped: 'lookup failed' };
  }
  if (subs.length === 0) return { ...result, skipped: 'no subscriptions' };

  const body = JSON.stringify(payload);

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
      );
      result.sent += 1;
    } catch (error) {
      if (isGone(error.statusCode)) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        result.removed += 1;
      } else {
        result.failed += 1;
        console.error(`Push to ${sub.endpoint.slice(0, 40)}… failed (${error.statusCode}):`, error.body || error.message);
      }
    }
  }));

  return result;
}

module.exports = { sendToUser, isPushConfigured, publicKey };
