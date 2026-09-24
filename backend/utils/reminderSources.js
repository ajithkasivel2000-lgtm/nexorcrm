/**
 * Every CRM activity that has a time, described in one place.
 *
 * The point of the whole exercise: adding reminders to a module means adding a
 * descriptor here, not writing another reminder loop. Nothing below knows how
 * to send a notification, and reminders.js knows nothing about leads, tasks or
 * site visits — the two meet through this shape.
 *
 * Each source says:
 *   type      a stable key, stored on ReminderLog
 *   label     how the activity reads in the notification
 *   find      the rows due between two instants, already filtered to live ones
 *   dueAt     where the time lives on a row
 *   ownerOf   who is answerable for it (a username or a user id; either
 *             resolves, because this CRM stores both — see leadPeople)
 *   urlOf     where clicking the notification lands
 *   titleOf   the human name of the thing
 *
 * `find` carries its own definition of "still live", which is what stops a
 * reminder for something completed, cancelled or already converted. There is no
 * separate cancellation step anywhere in this system: an activity that no
 * longer matches its own query simply stops being found.
 */

const prisma = require('../prismaClient');

/** Statuses that mean the work is over, per module. */
const DEAD_LEAD = ['Rejected', 'Duplicate', 'Opportunity', 'Closed'];
const DEAD_TASK = ['Completed', 'Cancelled'];
const DEAD_VISIT = ['Completed', 'Cancelled', 'No Show', 'Done'];

const SOURCES = [
  {
    type: 'lead-followup',
    label: 'Lead follow-up',
    dueAt: (r) => r.followUpDate,
    ownerOf: (r) => r.owner || r.ownerId,
    urlOf: (r) => `/leads/${r.id}`,
    titleOf: (r) => r.name || r.id,
    find: (from, to) => prisma.lead.findMany({
      where: {
        followUpDate: { gte: from, lte: to },
        status: { notIn: DEAD_LEAD },
      },
      select: { id: true, name: true, owner: true, ownerId: true, followUpDate: true },
    }),
  },

  {
    type: 'opportunity-followup',
    label: 'Opportunity follow-up',
    dueAt: (r) => r.nextFollowUpDate,
    ownerOf: (r) => r.opportunityOwner,
    urlOf: (r) => `/opportunities/${r.id}`,
    titleOf: (r) => r.opportunityName || r.oppId || r.id,
    find: (from, to) => prisma.opportunity.findMany({
      where: {
        nextFollowUpDate: { gte: from, lte: to },
        NOT: { stage: { startsWith: 'Closed' } },
      },
      select: { id: true, oppId: true, opportunityName: true, opportunityOwner: true, nextFollowUpDate: true },
    }),
  },

  {
    /* Task is deliberately generic in this schema — entityType/entityId — so
       this one descriptor already covers a project milestone, an approval, a
       payment due and a plain to-do. They differ by what created them, not by
       how they are reminded. */
    type: 'task',
    label: 'Task',
    dueAt: (r) => r.dueDate,
    ownerOf: (r) => r.assignedTo,
    urlOf: (r) => urlForEntity(r.entityType, r.entityId),
    titleOf: (r) => r.title,
    find: (from, to) => prisma.task.findMany({
      where: {
        dueDate: { gte: from, lte: to },
        status: { notIn: DEAD_TASK },
      },
      select: {
        id: true, title: true, dueDate: true, assignedTo: true,
        entityType: true, entityId: true, priority: true,
      },
    }),
  },

  {
    /* Activity covers Call, Callback, Meeting and Demo for the same reason:
       they are rows of one table that differ by `type`, so they need one
       descriptor rather than four. */
    type: 'activity-next-action',
    label: 'Scheduled activity',
    dueAt: (r) => r.nextActionDate,
    ownerOf: (r) => r.assignedTo || r.createdBy,
    urlOf: (r) => urlForEntity(r.entityType, r.entityId),
    titleOf: (r) => r.nextAction || r.subject || r.type,
    find: (from, to) => prisma.activity.findMany({
      where: {
        nextActionDate: { gte: from, lte: to },
        NOT: { status: 'Cancelled' },
      },
      select: {
        id: true, type: true, subject: true, nextAction: true, nextActionDate: true,
        assignedTo: true, createdBy: true, entityType: true, entityId: true,
      },
    }),
  },

  {
    type: 'site-visit',
    label: 'Site visit',
    dueAt: (r) => r.scheduledAt,
    ownerOf: (r) => r.assignedToId || r.assignedToName,
    urlOf: (r) => (r.leadId ? `/leads/${r.leadId}` : '/site-visits'),
    titleOf: (r) => r.customerName || r.projectName || 'Site visit',
    find: (from, to) => prisma.siteVisit.findMany({
      where: {
        scheduledAt: { gte: from, lte: to },
        status: { notIn: DEAD_VISIT },
        remindersOff: false,
      },
      select: { id: true, leadId: true, customerName: true, projectName: true, assignedToId: true, assignedToName: true, scheduledAt: true, status: true },
    }),
  },
];

/** Where a generic Task or Activity points, from the record it hangs off. */
function urlForEntity(entityType, entityId) {
  if (!entityId) return '/';
  const map = {
    lead: '/leads',
    opportunity: '/opportunities',
    customer: '/customers',
    project: '/projects',
    'channel-partner': '/channel-partners',
  };
  const base = map[String(entityType || '').toLowerCase()];
  return base ? `${base}/${entityId}` : '/';
}

module.exports = { SOURCES, urlForEntity };
