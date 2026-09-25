const prisma = require('../prismaClient');

/**
 * Data retention, run per company by the background sweep (jobs/leadReassignmentJob.js).
 *
 * These tables only ever grow: every login, every failed login, every email
 * (with its full HTML body), every notification ever bell-rung. Without a
 * prune the EmailOutbox alone becomes the largest table in the database —
 * rows carry customer data in their bodies — and the audit tables slow every
 * dashboard count that touches them.
 *
 * What is kept and for how long:
 *
 *   EmailOutbox          90 days after creation. Sent mail has been
 *                        delivered; failed mail has given up after its
 *                        retries. The row's value is the delivery record.
 *   SystemLog            180 days. Sign-in history the sessions tab counts;
 *                        twice the audit horizon below.
 *   UserAuditLog         180 days. Field-level audit trail; the visible tab
 *                        pages through the recent rows, older ones age out.
 *   Notification         read rows after 30 days; unread are never touched —
 *                        deleting something nobody has read would hide it.
 *   PasswordResetToken   expired or used tokens older than 7 days (the flows
 *                        already sweep on use; this is the janitor).
 *   BuyerLoginToken      expired portal tokens older than 7 days.
 *
 * Sessions are swept by utils/settings.js sweepSessions (expiry-driven), and
 * per-record logs (LeadLog and friends) are history someone paid for — they
 * are not pruned here.
 *
 * Every horizon can be overridden with RETENTION_DAYS as a JSON map, e.g.
 *   RETENTION_DAYS={"emailOutbox":30,"systemLog":365}
 */

const DEFAULTS = {
  emailOutbox: 90,
  systemLog: 180,
  userAuditLog: 180,
  notificationRead: 30,
  passwordResetToken: 7,
  buyerLoginToken: 7,
};

function horizons() {
  try {
    const overrides = JSON.parse(process.env.RETENTION_DAYS || '{}');
    return { ...DEFAULTS, ...overrides };
  } catch {
    return { ...DEFAULTS };
  }
}

const daysAgo = (days) => new Date(Date.now() - days * 86400000);

/**
 * One company's prune. Returns the counts of what it removed, so the sweep
 * can log it; returns zeros quietly when there is nothing to do.
 */
async function runRetentionSweep() {
  const h = horizons();
  const removed = {};

  // Sent or finally-failed mail past its horizon. Queued rows still awaiting
  // a retry are never deleted, whatever their age.
  removed.emailOutbox = await prisma.emailOutbox.deleteMany({
    where: {
      createdAt: { lt: daysAgo(h.emailOutbox) },
      status: { in: ['sent', 'failed'] },
    },
  }).then((r) => r.count).catch(() => 0);

  removed.systemLog = await prisma.systemLog.deleteMany({
    where: { createdAt: { lt: daysAgo(h.systemLog) } },
  }).then((r) => r.count).catch(() => 0);

  removed.userAuditLog = await prisma.userAuditLog.deleteMany({
    where: { createdAt: { lt: daysAgo(h.userAuditLog) } },
  }).then((r) => r.count).catch(() => 0);

  removed.notification = await prisma.notification.deleteMany({
    where: {
      // Read ones age out; unread are never touched.
      readAt: { not: null, lt: daysAgo(h.notificationRead) },
    },
  }).then((r) => r.count).catch(() => 0);

  removed.passwordResetToken = await prisma.passwordResetToken.deleteMany({
    where: { expiresAt: { lt: daysAgo(h.passwordResetToken) } },
  }).then((r) => r.count).catch(() => 0);

  removed.buyerLoginToken = await prisma.buyerLoginToken.deleteMany({
    where: { expiresAt: { lt: daysAgo(h.buyerLoginToken) } },
  }).then((r) => r.count).catch(() => 0);

  return removed;
}

module.exports = { runRetentionSweep, DEFAULTS };
