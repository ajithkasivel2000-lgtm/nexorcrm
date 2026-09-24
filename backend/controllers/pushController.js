const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { isPushConfigured, publicKey, sendToUser } = require('../utils/push');

/**
 * The key a browser needs before it can subscribe.
 *
 * Also reports whether push is configured at all, so the UI can stay quiet
 * rather than offering a button that cannot work.
 */
exports.getPublicKey = async (req, res) => {
  res.status(200).json({ enabled: isPushConfigured(), publicKey: publicKey() });
};

/**
 * Records one browser's subscription.
 *
 * Keyed on the endpoint: re-subscribing from the same browser updates the row
 * rather than adding another, which is what stops one person collecting a
 * dozen rows and getting a dozen copies of every notification.
 */
exports.subscribe = async (req, res) => {
  try {
    const { subscription } = req.body;
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const auth = subscription?.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ message: 'A complete push subscription is required.' });
    }

    // A subscription is bound to the signed-in user, never to a userId from
    // the body — otherwise one user could route their subscriptions (and
    // every notification meant for them) at somebody else.
    const user = { id: req.user.id };

    const data = {
      userId: user.id,
      endpoint,
      p256dh,
      auth,
      userAgent: req.get('user-agent') || null,
    };

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: data,
      create: data,
    });

    res.status(201).json({ message: 'Subscribed.' });
  } catch (error) {
    sendError(res, error, 'Could not save the push subscription', 400);
  }
};

/** Forgets one browser. Unsubscribing a row that is already gone is fine. */
exports.unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ message: 'An endpoint is required.' });
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
    res.status(200).json({ message: 'Unsubscribed.' });
  } catch (error) {
    sendError(res, error, 'Could not remove the push subscription', 400);
  }
};

/**
 * Sends a test notification to the signed-in user's own devices.
 *
 * Push has a long chain — permission, service worker, VAPID keys, the push
 * service itself — and without this the only way to find out it is broken is
 * to create a real lead and notice nothing arrived.
 */
exports.sendTest = async (req, res) => {
  try {
    // A test goes to the signed-in user's own devices — that is the point of
    // a test — so identity comes from the session, not the body.
    const user = { id: req.user.id, username: req.user.username };

    const result = await sendToUser(user.id, {
      title: 'NexorCRM',
      body: 'Notifications are working. This is a test.',
      url: '/',
      tag: 'nexorcrm-test',
    });

    if (result.skipped) {
      return res.status(409).json({ message: `Nothing sent: ${result.skipped}.`, ...result });
    }
    res.status(200).json({ message: `Sent to ${result.sent} device(s).`, ...result });
  } catch (error) {
    sendError(res, error, 'Could not send the test notification', 500);
  }
};
