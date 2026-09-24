/**
 * The bridge between the lead's site-visit fields and the SiteVisit record.
 *
 * The CRM's existing screens save a site visit by writing three columns on the
 * lead — siteVisitStatus, siteVisitDate, siteVisitNote — and that is not
 * changing. This turns each of those saves into the matching move on the
 * visit's own lifecycle, so scheduling from the screen people already use
 * gets the internal push, the customer email, the reminders, the audit trail
 * and the duplicate suppression, with no change to the screen at all.
 *
 * It lives in its own module because the lifecycle (siteVisit.js) and the
 * notifications (siteVisitNotify.js) already depend on each other one way;
 * putting the bridge in either would make that a cycle.
 *
 * Nothing here throws. A lead that saved must not fail because its visit
 * record or its email did not.
 */

const prisma = require('../prismaClient');
const {
  scheduleVisit, transitionVisit, gatherVisitDetails, isTerminal,
} = require('./siteVisit');
const { announce } = require('./siteVisitNotify');

/**
 * What the existing screens send, and what it means on the lifecycle.
 *
 * The left-hand strings are the values LeadProfile has always posted; they are
 * not renamed, because every list, filter and report already reads them.
 */
const STATUS_MAP = {
  'Site Visit': 'Scheduled',
  Scheduled: 'Scheduled',
  'Re Scheduled Visit': 'Rescheduled',
  Rescheduled: 'Rescheduled',
  'Site Visit Confirmed': 'Confirmed',
  Confirmed: 'Confirmed',
  'In Progress': 'In Progress',
  'Site Visit Done': 'Completed',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
  Rejected: 'Cancelled',
  'No Show': 'No Show',
};

/** The lifecycle state a lead update implies, or null if it implies none. */
function mapStatus(body) {
  const raw = body?.siteVisitStatus || (body?.status === 'Site Visit' ? 'Site Visit' : null);
  if (!raw) return null;
  return STATUS_MAP[raw] || null;
}

/** Which announcement a move deserves. In Progress is deliberately silent. */
function eventFor(status, rescheduled) {
  if (rescheduled) return 'rescheduled';
  switch (status) {
    case 'Scheduled': return 'scheduled';
    case 'Confirmed': return 'confirmed';
    case 'Cancelled': return 'cancelled';
    case 'Completed': return 'completed';
    case 'No Show': return 'no-show';
    // The team is on site and the customer is standing in front of them.
    default: return null;
  }
}

/**
 * Bring the visit record in step with a lead that has just been saved.
 *
 * @param {object} lead    the lead AFTER the update
 * @param {object} options body — what the request sent; actor — who saved it
 * @returns {Promise<{visit: object, event: string|null}|null>}
 */
async function syncSiteVisitFromLead(lead, { body = {}, actor = null } = {}) {
  try {
    const status = mapStatus(body);
    const when = body.siteVisitDate || lead.siteVisitDate;

    // Nothing about this save was a site visit.
    if (!status && !body.siteVisitDate) return null;

    /* The visit currently in play. A lead can accumulate several over time —
       a cancelled one, then a new booking — so the live one is the most
       recent that has not ended. */
    const live = await prisma.siteVisit.findFirst({
      where: { leadId: lead.id, status: { notIn: ['Completed', 'Cancelled', 'No Show'] } },
      orderBy: { createdAt: 'desc' },
    });

    /* ---- nothing live: this is a booking ------------------------------- */
    if (!live) {
      /* A terminal status with no live visit is a lead being closed off
         without one ever existing — there is nothing to cancel or complete,
         and inventing a visit to immediately end would put a phantom in the
         history. */
      if (!when || (status && isTerminal(status))) return null;

      const { visit } = await scheduleVisit({
        leadId: lead.id,
        scheduledAt: when,
        note: body.siteVisitNote || null,
        createdBy: actor,
        status: status || 'Scheduled',
      });

      const details = await gatherVisitDetails(lead.id);
      await announce(visit, 'scheduled', details);
      return { visit, event: 'scheduled' };
    }

    /* ---- something live: this is a move -------------------------------- */
    const movedTime = Boolean(
      body.siteVisitDate
      && new Date(body.siteVisitDate).getTime() !== new Date(live.scheduledAt).getTime(),
    );

    // Neither the time nor the state actually changed; say nothing.
    if (!movedTime && (!status || status === live.status)) return null;

    const nextStatus = status || (movedTime ? 'Rescheduled' : live.status);

    const visit = await transitionVisit(live.id, {
      status: nextStatus,
      scheduledAt: movedTime ? body.siteVisitDate : null,
      note: body.siteVisitNote ?? null,
      /* A visit closed off from the lead screen has no reason field of its
         own, so the status the user picked is the reason. */
      cancelReason: nextStatus === 'Cancelled'
        ? (body.rejectedReason || body.reasonDetails || `closed as ${body.siteVisitStatus || 'cancelled'}`)
        : null,
      outcomeNote: nextStatus === 'Completed' ? (body.siteVisitDoneNote || null) : null,
      actor,
    });

    const event = eventFor(nextStatus, movedTime);
    if (event) {
      const details = await gatherVisitDetails(lead.id);
      await announce(visit, event, details);
    }

    return { visit, event };
  } catch (error) {
    console.error('Could not sync the site visit from the lead update:', error.message);
    return null;
  }
}

module.exports = { syncSiteVisitFromLead, mapStatus, eventFor, STATUS_MAP };
