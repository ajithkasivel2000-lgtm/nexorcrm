/**
 * The follow-up clock.
 *
 * A lead that has just been assigned gets a deadline. If its owner does
 * something about it before the deadline the clock stops; if they do not, the
 * lead moves to the next seat on the project rota and a fresh clock starts.
 * That repeats until somebody handles it or the lead reaches a status that
 * ends it.
 *
 * Everything here is written to the database rather than held in memory: the
 * deadline is a column, not a setTimeout, so closing a browser, restarting the
 * server or running two copies of the process changes nothing about when a
 * lead moves.
 *
 * The one rule worth stating twice: a turn is *claimed* before anything is
 * sent. Claiming is a conditional UPDATE that only succeeds for whoever gets
 * there first, so a second run of the job — or a second server — finds nothing
 * to do and nobody gets a second email.
 */

const prisma = require('../prismaClient');
const { nextOwnerAfter, resolveUser } = require('./leadRoundRobin');
const { notifyLeadOwner } = require('./leadNotify');
const { stageForStatus, isClosedStage } = require('./leadStages');
const { isSuperAdmin } = require('./permissions');
const { PRESALES_RRQ_TYPE } = require('./rrqTypes');

/** Fallback only — the real value is the LeadAssignmentSetting row. */
const DEFAULT_TIMEOUT_MINUTES = 30;

/**
 * The configured window, read fresh each time.
 *
 * Requirement: one central setting, changeable to 15/30/45/60 without a
 * deploy. Reading it per run rather than caching it is what makes a change
 * take effect on the next sweep instead of the next restart.
 */
async function getSettings() {
  try {
    const row = await prisma.leadAssignmentSetting.findFirst({ orderBy: { createdAt: 'asc' } });
    if (row) return row;
    return await prisma.leadAssignmentSetting.create({ data: {} });
  } catch (error) {
    console.error('Could not read the lead assignment setting:', error.message);
    return { timeoutMinutes: DEFAULT_TIMEOUT_MINUTES, enabled: true, maxCycles: 0 };
  }
}

/**
 * Whether a status ends the lead's life in the rota.
 *
 * Derived from the existing stage mapper rather than a second list of status
 * names: the statuses are a master table people edit, and a hard-coded list
 * here would go stale the first time somebody adds one. Closed stages are
 * Lost / Junk / Disqualified / On Hold; a lead that has become an opportunity
 * or a customer is equally finished with as far as first response goes.
 */
function isTerminalStatus(status) {
  const stage = stageForStatus(status);
  if (!stage) return false;
  return isClosedStage(stage) || stage === 'Customer' || stage === 'Opportunity';
}

/** Dates in, minutes out — null-safe, so a missing stamp reads as "ages ago". */
const minutesSince = (date) => (date ? (Date.now() - new Date(date).getTime()) / 60000 : Infinity);

/**
 * Tell the owner about a lead that gets no clock.
 *
 * Callers route the owner's notification through startAssignmentTimer so one
 * assignment is announced once. When no clock opens — reassignment switched
 * off, a finished lead, the super admin holding it — that announcement used to
 * be skipped with it, and the owner of a brand-new lead heard nothing at all.
 */
async function announceWithoutClock(lead, notify, notifyContext) {
  if (!notify) return;
  try {
    await notifyLeadOwner(lead, notifyContext);
  } catch (error) {
    console.error('Lead owner notification failed:', error.message);
  }
}

/**
 * Open a turn of the clock for whoever now holds the lead.
 *
 * Called from three places: the round-robin at creation, a person reassigning
 * by hand, and the job itself after it moves a lead. Any turn still waiting on
 * this lead is settled first, so a lead can never hold two live timers —
 * together with the unique (leadId, cycle) index that is what stops duplicate
 * timers however the function is reached.
 *
 * Never throws. A lead that saved must not fail because its clock did not.
 */
async function startAssignmentTimer(lead, {
  ownerId,
  ownerName,
  fromUserId = null,
  fromName = null,
  source = 'round-robin',
  reason = null,
  notify = false,
  notifyContext = {},
} = {}) {
  if (!lead?.id || !ownerId) return null;

  try {
    const settings = await getSettings();

    /* Off means off.
       The sweep already refused to move anything while this is false, but the
       clock was still being started: a waiting row was written, the countdown
       ran in the lead's header, the audit line said "Response due by ...", and
       the new owner was emailed that the lead would move on if they did not
       act. Nothing was ever going to move it, so every one of those was a
       promise the system had already decided not to keep.

       No clock is started, and any clock still running for this lead is stood
       down — which is what "leave every lead with its current owner" says on
       the settings screen. */
    if (!settings.enabled) {
      await cancelPendingFor(lead.id, 'automatic reassignment is switched off');
      await announceWithoutClock(lead, notify, notifyContext);
      return null;
    }

    // A finished lead does not get a clock, whatever put it in this state.
    if (isTerminalStatus(lead.status)) {
      await cancelPendingFor(lead.id, `lead is ${lead.status}`);
      await announceWithoutClock(lead, notify, notifyContext);
      return null;
    }

    /* The super admin holds a lead precisely when nobody else should: a
       duplicate, or one no project rota could place. They sit on no rota, so
       the clock could only ever run down and try to hand the lead to the next
       seat after someone who has no seat — a countdown on screen promising a
       handover that cannot happen. They keep the lead until a person moves it
       on deliberately. */
    const owner = await resolveUser(ownerId);
    if (isSuperAdmin(owner)) {
      await cancelPendingFor(lead.id, 'owned by the super admin, who is not on a rota');
      await announceWithoutClock(lead, notify, notifyContext);
      return null;
    }

    const now = new Date();
    const dueAt = new Date(now.getTime() + settings.timeoutMinutes * 60000);

    /* Settle whatever was still running. 'satisfied' rather than 'cancelled'
       when a person took over: the previous holder's turn ended because the
       lead moved on, not because the feature was switched off. */
    await prisma.leadAssignment.updateMany({
      where: { leadId: lead.id, state: 'waiting' },
      data: { state: 'satisfied', settledAt: now },
    });

    /* The next turn number comes from the highest cycle this lead has *ever*
       had, not from the one that happened to be waiting. The reassignment path
       closes the old turn before opening the new one, so by the time it gets
       here there is no waiting row to count from — deriving the cycle from
       that left every reassignment trying to reopen cycle 0, colliding with
       the unique index, and silently never starting a second timer. */
    const latest = await prisma.leadAssignment.findFirst({
      where: { leadId: lead.id },
      orderBy: { cycle: 'desc' },
      select: { cycle: true },
    });
    const cycle = latest ? latest.cycle + 1 : 0;

    /* `create` can still lose a race with another request assigning the same
       lead in the same millisecond; the unique index turns that into an error
       rather than a second timer, and the loser simply does not open one. */
    let assignment;
    try {
      assignment = await prisma.leadAssignment.create({
        data: {
          leadId: lead.id,
          ownerId,
          ownerName: ownerName || null,
          fromUserId,
          fromName,
          cycle,
          source,
          reason,
          assignedAt: now,
          dueAt,
        },
      });
    } catch (error) {
      // P2002 is the unique violation: somebody else opened this turn first.
      if (error.code === 'P2002') return null;
      throw error;
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: { assignedAt: now, lastActivityAt: null },
    }).catch(() => { });

    await writeAssignmentLog(lead.id, {
      title: source === 'auto-reassign' ? 'Reassigned automatically' : 'Assigned',
      subtitle: buildAuditLine({ fromName, ownerName, source, reason, dueAt, settings }),
      field: 'owner',
      oldValue: fromName || null,
      newValue: ownerName || ownerId,
      actor: source === 'auto-reassign' ? 'system' : (notifyContext.creator || null),
    });

    /* The deadline goes out with the notification, so the person being told
       they own a lead is told in the same breath how long they have and what
       happens if they do nothing. This is the only place that knows both. */
    if (notify) {
      await sendAssignmentNotice(assignment, lead, {
        ...notifyContext,
        followUp: { dueAt, timeoutMinutes: settings.timeoutMinutes },
      });
    }

    return assignment;
  } catch (error) {
    console.error('Could not start the lead follow-up timer:', error.message);
    return null;
  }
}

/** The sentence an administrator reads in the lead's history. */
function buildAuditLine({ fromName, ownerName, source, reason, dueAt, settings }) {
  const who = fromName ? `${fromName} → ${ownerName || 'unassigned'}` : `${ownerName || 'unassigned'}`;
  const why = reason ? ` Reason: ${reason}.` : '';
  const how = source === 'auto-reassign' ? 'Automatic reassignment'
    : source === 'manual' ? 'Assigned by hand'
      : 'Project round-robin';
  return `${how}: ${who}.${why} Response due by ${dueAt.toISOString()} `
    + `(${settings.timeoutMinutes} minute window).`;
}

/** Audit entries must never take a request down with them. */
async function writeAssignmentLog(leadId, data) {
  try {
    await prisma.leadLog.create({ data: { leadId, ...data } });
  } catch (error) {
    console.error('Could not write the assignment log:', error.message);
  }
}

/**
 * Push and email for one turn, exactly once.
 *
 * The row is stamped `notifiedAt` *before* anything is sent, and only by
 * whoever wins the conditional update. A crash between the stamp and the send
 * loses a notification; the alternative — stamping afterwards — sends two
 * every time the process dies mid-flight, which is the failure people actually
 * notice. Delivery itself is already push-then-email with each wrapped
 * separately in leadNotify, so one failing does not stop the other.
 */
async function sendAssignmentNotice(assignment, lead, context = {}) {
  const claimed = await prisma.leadAssignment.updateMany({
    where: { id: assignment.id, notifiedAt: null },
    data: { notifiedAt: new Date(), notifyAttempts: { increment: 1 } },
  });
  if (claimed.count !== 1) return null;   // already announced by someone else

  let delivery = null;
  try {
    delivery = await notifyLeadOwner(lead, context);
  } catch (error) {
    console.error('Lead assignment notification failed:', error.message);
    delivery = { push: `failed (${error.message})`, email: `failed (${error.message})` };
  }

  await prisma.leadAssignment.update({
    where: { id: assignment.id },
    data: {
      pushResult: String(delivery?.push ?? 'unknown').slice(0, 200),
      emailResult: String(delivery?.email ?? 'unknown').slice(0, 200),
    },
  }).catch(() => { });

  return delivery;
}

/**
 * The owner did something, so the clock stops.
 *
 * Requirement: a valid update within the window cancels the pending move and
 * leaves the assignment exactly as it is. Only the current owner's activity
 * counts — an administrator opening the record is not the owner responding —
 * and the turn is only settled if it is still waiting, so a lead the job has
 * already claimed is not un-reassigned by a late save.
 */
async function recordLeadActivity(leadId, { actorId, actorName, kind = 'update' } = {}) {
  if (!leadId) return false;

  try {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return false;

    const pending = await prisma.leadAssignment.findFirst({
      where: { leadId, state: 'waiting' },
      orderBy: { cycle: 'desc' },
    });
    if (!pending) return false;

    /* Whose action counts. actorId is a uuid when the caller knows it and a
       username otherwise, so both are compared against the owner. */
    let actorUserId = actorId || null;
    if (actorUserId && !/^[0-9a-f-]{36}$/i.test(actorUserId)) {
      const resolved = await resolveUser(actorUserId);
      actorUserId = resolved ? resolved.id : null;
    }
    const byOwner = actorUserId
      ? actorUserId === pending.ownerId
      : false;

    if (!byOwner) return false;

    const settled = await prisma.leadAssignment.updateMany({
      where: { id: pending.id, state: 'waiting' },
      data: { state: 'satisfied', settledAt: new Date(), reason: `owner ${kind}` },
    });
    if (settled.count !== 1) return false;   // the job got there first

    await prisma.lead.update({
      where: { id: leadId },
      data: { lastActivityAt: new Date() },
    }).catch(() => { });

    await writeAssignmentLog(leadId, {
      title: 'Follow-up satisfied',
      subtitle: `${actorName || 'The owner'} acted on this lead within the response window, `
        + 'so the pending reassignment was cancelled.',
      actor: actorName || null,
    });

    return true;
  } catch (error) {
    console.error('Could not record lead activity:', error.message);
    return false;
  }
}

/** Stop every live turn on a lead — it is finished, or it was deleted. */
async function cancelPendingFor(leadId, reason) {
  try {
    const stopped = await prisma.leadAssignment.updateMany({
      where: { leadId, state: 'waiting' },
      data: { state: 'cancelled', settledAt: new Date(), reason: reason || null },
    });
    if (stopped.count > 0) {
      await writeAssignmentLog(leadId, {
        title: 'Follow-up stopped',
        subtitle: `Automatic reassignment cancelled: ${reason || 'no longer applicable'}.`,
        actor: 'system',
      });
    }
    return stopped.count;
  } catch (error) {
    console.error('Could not cancel the pending reassignment:', error.message);
    return 0;
  }
}

/**
 * One sweep: move every lead whose window has run out.
 *
 * Each lead is handled on its own — one that cannot be moved must not stop the
 * rest — and each is claimed before it is touched, so running this twice over
 * the same due row reassigns it once.
 */
async function runReassignmentSweep({ now = new Date(), limit = 200 } = {}) {
  const summary = { checked: 0, reassigned: 0, skipped: 0, cancelled: 0, errors: 0 };

  const settings = await getSettings();
  if (!settings.enabled) return { ...summary, disabled: true };

  let due = [];
  try {
    due = await prisma.leadAssignment.findMany({
      where: { state: 'waiting', dueAt: { lte: now } },
      orderBy: { dueAt: 'asc' },
      take: limit,
    });
  } catch (error) {
    console.error('Could not list leads due for reassignment:', error.message);
    return { ...summary, errors: 1 };
  }

  for (const pending of due) {
    summary.checked += 1;
    try {
      // eslint-disable-next-line no-await-in-loop
      const moved = await reassignOne(pending, settings);
      if (moved === 'reassigned') summary.reassigned += 1;
      else if (moved === 'cancelled') summary.cancelled += 1;
      else summary.skipped += 1;
    } catch (error) {
      summary.errors += 1;
      console.error(`Reassignment failed for lead ${pending.leadId}:`, error.message);
    }
  }

  return summary;
}

/**
 * Move one lead to the next seat.
 *
 * The order matters. The turn is claimed first with a conditional update; only
 * the caller that wins it goes on to read the rota, write the owner and send
 * the notifications. Everything after the claim is therefore single-threaded
 * per assignment, whatever else is running.
 */
async function reassignOne(pending, settings) {
  const lead = await prisma.lead.findUnique({ where: { id: pending.leadId } });

  // Deleted underneath us.
  if (!lead) {
    await prisma.leadAssignment.updateMany({
      where: { id: pending.id, state: 'waiting' },
      data: { state: 'cancelled', settledAt: new Date(), reason: 'lead no longer exists' },
    });
    return 'cancelled';
  }

  // Finished while the clock ran.
  if (isTerminalStatus(lead.status)) {
    await cancelPendingFor(lead.id, `lead is ${lead.status}`);
    return 'cancelled';
  }

  /* Moved by hand since this turn opened. The manual assignment opened its own
     turn, so this stale one simply ends — the new owner gets the normal window
     rather than inheriting the old one's remaining seconds. */
  if (lead.ownerId && lead.ownerId !== pending.ownerId) {
    await prisma.leadAssignment.updateMany({
      where: { id: pending.id, state: 'waiting' },
      data: { state: 'satisfied', settledAt: new Date(), reason: 'reassigned by hand' },
    });
    return 'skipped';
  }

  // The owner acted after the row was read but before it was claimed.
  if (lead.lastActivityAt && new Date(lead.lastActivityAt) > new Date(pending.assignedAt)) {
    await prisma.leadAssignment.updateMany({
      where: { id: pending.id, state: 'waiting' },
      data: { state: 'satisfied', settledAt: new Date(), reason: 'owner acted in time' },
    });
    return 'skipped';
  }

  if (settings.maxCycles > 0 && pending.cycle + 1 >= settings.maxCycles) {
    await cancelPendingFor(lead.id, `reached the ${settings.maxCycles}-cycle limit`);
    return 'cancelled';
  }

  /* The rota is keyed on the project's *name*; leads store either the name or
     the id depending on their age, so resolve before asking. */
  const projectName = await projectNameFor(lead.project);
  const next = await nextOwnerAfter({
    projectName,
    rrqType: PRESALES_RRQ_TYPE,
    currentOwnerId: pending.ownerId,
  });

  /* Requirement: no eligible user means leave the lead where it is. The turn
     is closed so the job stops re-examining it every minute, and the reason is
     on the record so it is obvious why the lead stopped moving. */
  if (!next) {
    await prisma.leadAssignment.updateMany({
      where: { id: pending.id, state: 'waiting' },
      data: {
        state: 'cancelled',
        settledAt: new Date(),
        reason: 'no other eligible user on the project rota',
      },
    });
    await writeAssignmentLog(lead.id, {
      title: 'Follow-up stopped',
      subtitle: 'The response window passed, but no other available user is on this '
        + "project's round-robin, so the lead stays with its current owner.",
      actor: 'system',
    });
    return 'cancelled';
  }

  /* Claim the turn. Whoever wins this update owns the reassignment; a second
     process finds count 0 and returns without touching the lead — which is
     what makes a duplicate job run harmless. */
  const claimed = await prisma.leadAssignment.updateMany({
    where: { id: pending.id, state: 'waiting' },
    data: {
      state: 'reassigned',
      settledAt: new Date(),
      reason: `${settings.timeoutMinutes}-minute inactivity`,
    },
  });
  if (claimed.count !== 1) return 'skipped';

  const fromUser = await prisma.user.findUnique({ where: { id: pending.ownerId } }).catch(() => null);
  const fromName = fromUser?.username || pending.ownerName || null;
  const toName = next.user.username || next.user.firstName || null;

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      owner: next.user.id,
      ownerId: next.user.id,
      assignedAt: new Date(),
      lastActivityAt: null,
    },
  });

  await writeAssignmentLog(lead.id, {
    title: 'Reassigned automatically',
    subtitle: `No response from ${fromName || 'the previous owner'} within `
      + `${settings.timeoutMinutes} minutes, so the lead moved to ${toName} `
      + 'using the project round-robin order.',
    field: 'owner',
    oldValue: fromName,
    newValue: toName,
    actor: 'system',
  });

  // The new turn, and the push + email that go with it.
  await startAssignmentTimer(updated, {
    ownerId: next.user.id,
    ownerName: toName,
    fromUserId: pending.ownerId,
    fromName,
    source: 'auto-reassign',
    reason: `${settings.timeoutMinutes}-minute inactivity`,
    notify: true,
    notifyContext: {
      ownerName: toName,
      projectName: await projectNameFor(lead.project),
      handover: { by: 'Automatic reassignment', from: fromName },
    },
  });

  return 'reassigned';
}

/** Project id or name in, name out — leads hold either. */
async function projectNameFor(project) {
  if (!project) return null;
  try {
    const row = await prisma.project.findUnique({ where: { id: String(project) } });
    if (row) return row.projectName;
  } catch {
    // Not an id; it is already a name.
  }
  return String(project);
}

module.exports = {
  startAssignmentTimer,
  recordLeadActivity,
  cancelPendingFor,
  runReassignmentSweep,
  reassignOne,
  isTerminalStatus,
  getSettings,
  minutesSince,
  DEFAULT_TIMEOUT_MINUTES,
};
