const prisma = require('../prismaClient');

/**
 * The audit trail for a user's record.
 *
 * One row per field changed, in the field/oldValue/newValue/actor shape this
 * app already uses for leads and opportunities. Written by every user-mutating
 * endpoint rather than parsed out of prose, so the audit tab renders "Role:
 * User -> Manager" from data.
 */

/**
 * Writes audit rows for a user update, one per changed field.
 *
 * @param {object} p
 * @param {string} p.userId       the user being changed
 * @param {string} p.actor        username of who made the change
 * @param {string} p.action       e.g. 'USER_UPDATED'
 * @param {object} p.before       the user row before the write
 * @param {object} p.after        the user row after the write
 * @param {string} [p.ip]         caller ip when known
 * @param {string[]} [p.skip]     field names not to audit (password hashes, etc.)
 */
async function auditFields({ userId, actor, action, before, after, ip, skip = ['password'] }) {
  const fields = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
  const changed = [];

  for (const field of fields) {
    if (skip.includes(field)) continue;
    const oldV = before ? before[field] : null;
    const newV = after ? after[field] : null;
    // Dates and Decimals compare as objects, so go through ISO/text.
    const a = oldV instanceof Date ? oldV.toISOString() : (oldV ?? null);
    const b = newV instanceof Date ? newV.toISOString() : (newV ?? null);
    if (String(a ?? '') === String(b ?? '')) continue;
    changed.push({
      userId,
      actor: actor || null,
      action,
      field,
      oldValue: a === null ? null : String(a),
      newValue: b === null ? null : String(b),
      ipAddress: ip ? String(ip).replace(/^::ffff:/, '') : null,
    });
  }

  if (changed.length) {
    await prisma.userAuditLog.createMany({ data: changed }).catch((err) => {
      console.error('Could not write user audit rows:', err.message);
    });
  }
  return changed.length;
}

/** Writes one free-form audit row (actions with no field to diff). */
async function auditEvent({ userId, actor, action, field = null, oldValue = null, newValue = null, ip, note = null }) {
  return prisma.userAuditLog.create({
    data: {
      userId,
      actor: actor || null,
      action,
      field,
      oldValue: oldValue === null || oldValue === undefined || oldValue === '' ? null : String(oldValue),
      newValue: newValue === null || newValue === undefined || newValue === '' ? null : String(newValue),
      ipAddress: ip ? String(ip).replace(/^::ffff:/, '') : null,
      note,
    },
  }).catch((err) => {
    console.error('Could not write a user audit row:', err.message);
    return null;
  });
}

/**
 * Records an account-status move and stamps the user row with who/when/why.
 * Called after the user has already been updated to the new status.
 */
async function recordStatusChange({ userId, fromStatus, toStatus, reason, changedBy }) {
  await prisma.userStatusHistory.create({
    data: {
      userId,
      fromStatus: fromStatus || null,
      toStatus,
      reason: reason || null,
      changedBy: changedBy || null,
    },
  }).catch((err) => console.error('Could not record the status change:', err.message));

  // The row itself carries the current state so lists and headers can show it
  // without joining the history.
  await prisma.user.update({
    where: { id: userId },
    data: { statusChangedAt: new Date(), statusChangedBy: changedBy || null, statusReason: reason || null },
  }).catch(() => {});
}

/**
 * Would making `candidateId` report to `managerId` create a loop?
 *
 * Walks the reporting_to chain upwards from the manager. If the candidate is
 * anywhere in it, the new edge would close a cycle.
 */
async function wouldCreateReportingCycle(candidateId, managerId) {
  if (!managerId || candidateId === managerId) return candidateId === managerId;
  const seen = new Set([candidateId]);
  let current = managerId;

  for (let depth = 0; depth < 25 && current; depth += 1) {
    if (seen.has(current)) return true;
    seen.add(current);
    const row = await prisma.user.findUnique({
      where: { id: current },
      select: { id: true, reporting_to: true },
    });
    if (!row || !row.reporting_to) return false;
    // reporting_to holds either an id or a username; follow whichever it is.
    const next = await prisma.user.findFirst({
      where: { OR: [{ id: row.reporting_to }, { username: row.reporting_to }] },
      select: { id: true },
    });
    current = next ? next.id : null;
    if (current === candidateId) return true;
  }
  return false;
}

module.exports = { auditFields, auditEvent, recordStatusChange, wouldCreateReportingCycle };
