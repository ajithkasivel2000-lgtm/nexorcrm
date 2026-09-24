const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const {
  STATUSES, isValidStatus, scheduleVisit, transitionVisit,
  checkIn, checkOut, createFollowUpTask, gatherVisitDetails,
} = require('../utils/siteVisit');
const { announce } = require('../utils/siteVisitNotify');

/**
 * Site visits for a lead.
 *
 * Every write here follows the same shape: save first, then announce. The
 * response does not wait on the mail server — a visit that is saved is saved
 * whether or not the email got out, and the notification history records what
 * happened either way.
 */

/** The actor, from the session the auth middleware already resolved. */
const actorOf = (req) => req.user?.username || req.headers['x-username'] || 'system';

/** Announce after responding: notifications must never fail a save. */
const announceLater = (visit, event) => setImmediate(async () => {
  try {
    const details = await gatherVisitDetails(visit.leadId);
    await announce(visit, event, details);
  } catch (error) {
    console.error(`Could not announce the site visit ${event}:`, error.message);
  }
});

exports.list = async (req, res) => {
  try {
    const visits = await prisma.siteVisit.findMany({
      where: { leadId: req.params.leadId },
      orderBy: { scheduledAt: 'desc' },
      include: {
        notifications: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, event: true, audience: true, channel: true,
            recipientName: true, recipientEmail: true, status: true,
            attempts: true, error: true, sentAt: true, createdAt: true,
          },
        },
      },
    });
    res.status(200).json(visits);
  } catch (error) {
    sendError(res, error, 'Failed to fetch site visits', 500);
  }
};

exports.create = async (req, res) => {
  try {
    const { scheduledAt, note, customerNote, timezone, status } = req.body;
    if (!scheduledAt) {
      return res.status(400).json({ message: 'A site visit needs a date and time.' });
    }
    if (status && !isValidStatus(status)) {
      return res.status(400).json({ message: `Status must be one of: ${STATUSES.join(', ')}.` });
    }

    const { visit } = await scheduleVisit({
      leadId: req.params.leadId,
      scheduledAt,
      note: note || null,
      customerNote: customerNote || null,
      timezone,
      status: status || 'Scheduled',
      createdBy: actorOf(req),
    });

    res.status(201).json(visit);
    announceLater(visit, 'scheduled');
    return undefined;
  } catch (error) {
    return sendError(res, error, error.message || 'Failed to schedule the site visit', 400);
  }
};

/**
 * Change status, time, or both.
 *
 * The event announced follows what actually changed, so a reschedule reads as
 * a reschedule to both audiences rather than as a generic update.
 */
exports.update = async (req, res) => {
  try {
    const { status, scheduledAt, note, cancelReason, outcome, outcomeNote } = req.body;
    if (status && !isValidStatus(status)) {
      return res.status(400).json({ message: `Status must be one of: ${STATUSES.join(', ')}.` });
    }

    const before = await prisma.siteVisit.findUnique({ where: { id: req.params.visitId } });
    if (!before) return res.status(404).json({ message: 'Site visit not found.' });

    const visit = await transitionVisit(req.params.visitId, {
      status, scheduledAt, note, cancelReason, outcome, outcomeNote, actor: actorOf(req),
    });

    res.status(200).json(visit);

    const movedTime = scheduledAt && String(before.scheduledAt) !== String(visit.scheduledAt);
    const event = movedTime ? 'rescheduled'
      : visit.status === 'Cancelled' ? 'cancelled'
        : visit.status === 'Confirmed' ? 'confirmed'
          : visit.status === 'Completed' ? 'completed'
            : visit.status === 'No Show' ? 'no-show'
              : null;
    // In Progress is not announced: the team is on site, and the customer is
    // standing in front of them.
    if (event) announceLater(visit, event);
    return undefined;
  } catch (error) {
    return sendError(res, error, error.message || 'Failed to update the site visit', 400);
  }
};

exports.checkIn = async (req, res) => {
  try {
    const visit = await checkIn(req.params.visitId, { actor: actorOf(req) });
    res.status(200).json(visit);
  } catch (error) {
    sendError(res, error, error.message || 'Failed to check in', 400);
  }
};

exports.checkOut = async (req, res) => {
  try {
    const { outcome, outcomeNote, followUp } = req.body;
    const visit = await checkOut(req.params.visitId, {
      actor: actorOf(req), outcome, outcomeNote,
    });

    /* An optional follow-up, created through the CRM's own Task table so it
       appears wherever tasks already appear. */
    let task = null;
    if (followUp?.title || followUp?.dueDate) {
      task = await createFollowUpTask(visit, {
        title: followUp.title,
        dueDate: followUp.dueDate,
        assignedTo: followUp.assignedTo,
        description: followUp.description,
        createdBy: actorOf(req),
      }).catch((error) => {
        console.error('Could not create the follow-up task:', error.message);
        return null;
      });
    }

    res.status(200).json({ ...visit, followUpTask: task });
    announceLater(visit, 'completed');
    return undefined;
  } catch (error) {
    return sendError(res, error, error.message || 'Failed to check out', 400);
  }
};

/** The notification history for one visit — who was told what, and whether it worked. */
exports.notifications = async (req, res) => {
  try {
    const rows = await prisma.siteVisitNotification.findMany({
      where: { siteVisitId: req.params.visitId },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(rows);
  } catch (error) {
    sendError(res, error, 'Failed to fetch the notification history', 500);
  }
};

exports.statuses = (req, res) => res.status(200).json(STATUSES);
