const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { emitToUser } = require('../utils/realtime');

/** How many the bell keeps. Older ones are trimmed as new ones arrive. */
const KEEP_PER_USER = 50;

/**
 * Records a notification for a user.
 *
 * Called from wherever something notable happens, and deliberately never
 * throws: failing to file a notification must not fail the thing it is about.
 *
 * @returns {Promise<object|null>} the row, or null when it could not be filed
 */
async function notify(userId, { title, body, url, kind = 'lead' }) {
  if (!userId || !title) return null;
  try {
    const row = await prisma.notification.create({
      data: { userId, title, body: body || null, url: url || null, kind },
    });
    // Straight to the bell of any browser or phone this person has open.
    emitToUser(userId, 'notification', { id: row.id, title: row.title, url: row.url || null });

    // Trim the tail so one user's bell cannot grow without limit.
    const old = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: KEEP_PER_USER,
      select: { id: true },
    });
    if (old.length) {
      await prisma.notification.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    }
    return row;
  } catch (error) {
    console.error('Could not record a notification:', error.message);
    return null;
  }
}

/**
 * The signed-in user's notifications, newest first, with the unread count.
 *
 * Identity comes from the verified session (req.user, set by authMiddleware)
 * — never from a query param, which any caller could point at somebody else.
 * Only the unread ones by default: the bell is a list of things still to look
 * at, so marking one read is how you clear it. The read rows are kept — they
 * are the history, and `?read=include` asks for them.
 */
exports.list = async (req, res) => {
  try {
    if (!req.user) return res.status(200).json({ items: [], unread: 0 });
    const user = { id: req.user.id, username: req.user.username };

    const where = req.query.read === 'include'
      ? { userId: user.id }
      : { userId: user.id, readAt: null };

    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(req.query.limit, 10) || 20, KEEP_PER_USER),
      }),
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);

    res.status(200).json({ items, unread });
  } catch (error) {
    sendError(res, error, 'Could not load notifications', 500);
  }
};

/** Marks one as read. Marking an already-read one again is harmless. */
exports.markRead = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const user = { id: req.user.id, username: req.user.username };

    // Scoped to the owner, so an id from elsewhere cannot mark someone else's.
    const result = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.status(200).json({ updated: result.count });
  } catch (error) {
    sendError(res, error, 'Could not update the notification', 400);
  }
};

/** Marks everything the user has as read. */
exports.markAllRead = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const user = { id: req.user.id, username: req.user.username };

    const result = await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.status(200).json({ updated: result.count });
  } catch (error) {
    sendError(res, error, 'Could not update the notifications', 400);
  }
};

exports.notify = notify;
