/**
 * Site visits: the lifecycle, and the details a visit needs to describe itself.
 *
 * The lead's own siteVisit* columns are left exactly as they were — every list,
 * report and profile tab reads them, and this writes them too. What it adds is
 * a record that can hold the things those columns cannot: a cancellation, a no
 * show, an arrival and departure, an outcome, and a history of who was told.
 *
 * Nothing here sends anything. Notifications live in siteVisitNotify.js so the
 * lifecycle can be tested without a mail server.
 */

const prisma = require('../prismaClient');
const { findCompanySuperAdmin } = require('../utils/companyAdmin');

/** Every state a visit can be in, in the order it normally travels. */
const STATUSES = [
  'Scheduled', 'Confirmed', 'Rescheduled', 'In Progress',
  'Completed', 'Cancelled', 'No Show',
];

/** States that end the visit: no reminder should follow one of these. */
const TERMINAL_STATUSES = ['Completed', 'Cancelled', 'No Show'];

const isTerminal = (status) => TERMINAL_STATUSES.includes(status);
const isValidStatus = (status) => STATUSES.includes(status);

/**
 * The default zone for a visit whose caller did not name one.
 *
 * Stored per visit rather than assumed at formatting time: a reminder written
 * tomorrow must use the zone the appointment was agreed in, not the zone the
 * server happens to be running in when the sweep fires.
 */
const DEFAULT_TIMEZONE = process.env.CRM_TIMEZONE || 'Asia/Kolkata';

/**
 * Everything a visit needs about its lead, project and owner, in one read.
 *
 * Split into `internal` and `customer` deliberately: the customer half is the
 * only thing the customer email is allowed to see, and keeping the division
 * here means no template can reach past it for a lead id or an internal note.
 */
async function gatherVisitDetails(leadId) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return null;

  // Leads store either a project id or, for older rows, its name.
  let project = null;
  if (lead.project) {
    project = await prisma.project.findFirst({
      where: { OR: [{ id: String(lead.project) }, { projectName: String(lead.project) }] },
    }).catch(() => null);
  }

  let owner = null;
  if (lead.ownerId || lead.owner) {
    owner = await prisma.user.findFirst({
      where: {
        OR: [
          { id: String(lead.ownerId || lead.owner) },
          { username: String(lead.owner) },
        ],
      },
    }).catch(() => null);
  }

  return {
    lead,
    project,
    owner,
    // Safe to put in front of a customer: where, when, and who to ask for.
    customer: {
      name: lead.name || null,
      email: lead.email || null,
      phone: [lead.mobileCountryCode, lead.mobile].filter(Boolean).join(' ') || null,
      projectName: project?.projectName || (lead.project ? String(lead.project) : null),
      projectAddress: project?.projectLocation || null,
      projectMapLink: project?.mapLink || null,
      projectContact: project?.projectContact || null,
      hostName: owner?.firstName || owner?.username || null,
    },
    // Never leaves the building.
    internal: {
      leadId: lead.id,
      leadStatus: lead.status,
      ownerId: owner?.id || null,
      ownerName: owner?.username || null,
      ownerEmail: owner?.email || null,
      projectId: project?.id || null,
      projectEmail: project?.projectEmail || null,
      projectManager: project?.projectManager || null,
      salesManager: project?.salesManager || null,
    },
  };
}

/**
 * Who inside the business hears about this visit.
 *
 * The super admin and every admin, plus the lead's own owner and whoever the
 * project names as its managers. De-duplicated by id, because one person
 * filling two of those roles should still be told once.
 */
async function internalRecipients(details) {
  const found = new Map();
  const add = (user) => {
    if (user?.id && !found.has(user.id)) found.set(user.id, user);
  };

  try {
    // Admins and the super admin. `status` carries the role in this schema.
    const admins = await prisma.user.findMany({
      where: {
        status: { in: ['Admin', 'superadmin'] },
        archivedAt: null,
      },
    });
    admins.forEach(add);

    // The reserved account, whatever its status says.
    const superAdmin = await findCompanySuperAdmin();
    add(superAdmin);
  } catch (error) {
    console.error('Could not list admin recipients:', error.message);
  }

  add(details.owner);

  // The project's own people, named by username on the project row.
  for (const name of [details.internal.projectManager, details.internal.salesManager]) {
    if (!name) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      const user = await prisma.user.findFirst({ where: { username: String(name) } });
      add(user);
    } catch {
      // A name that is not a user is not an error; the project just has a label.
    }
  }

  return [...found.values()];
}

/**
 * Create the visit, and keep the lead's own columns in step.
 *
 * Both are written because both are read: the new record is the lifecycle, and
 * the old columns are what every existing screen and report still shows.
 */
async function scheduleVisit({
  leadId, scheduledAt, note = null, customerNote = null,
  timezone = DEFAULT_TIMEZONE, createdBy = null, status = 'Scheduled',
}) {
  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) throw new Error('A site visit needs a valid date and time.');

  const details = await gatherVisitDetails(leadId);
  if (!details) throw new Error('That lead no longer exists.');

  const visit = await prisma.siteVisit.create({
    data: {
      leadId,
      projectId: details.internal.projectId,
      projectName: details.customer.projectName,
      projectAddress: details.customer.projectAddress,
      projectMapLink: details.customer.projectMapLink,
      projectContact: details.customer.projectContact,
      customerName: details.customer.name,
      customerEmail: details.customer.email,
      customerPhone: details.customer.phone,
      assignedToId: details.internal.ownerId,
      assignedToName: details.internal.ownerName,
      scheduledAt: when,
      timezone,
      status,
      note,
      customerNote,
      createdBy,
    },
  });

  /* The lead's own columns, so the profile tab and the reports carry on
     working untouched. Failure here must not lose the visit. */
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      siteVisitStatus: status,
      siteVisitDate: when,
      siteVisitNote: note ?? undefined,
    },
  }).catch((error) => console.error('Could not mirror the visit onto the lead:', error.message));

  await writeTimeline(leadId, {
    title: 'Site visit scheduled',
    subtitle: `${formatVisitTime(when, timezone)}`
      + `${details.customer.projectName ? ` · ${details.customer.projectName}` : ''}`
      + `${details.internal.ownerName ? ` · host ${details.internal.ownerName}` : ''}`,
    field: 'siteVisitDate',
    newValue: when.toISOString(),
    actor: createdBy,
  });

  await recordActivity(visit, { type: 'Site Visit', subject: 'Site visit scheduled', createdBy });

  return { visit, details };
}

/**
 * Move a visit to a new state.
 *
 * Reaching an end state sets `remindersOff` in the same write, so there is no
 * window in which a cancelled visit can still have a reminder sent for it.
 */
async function transitionVisit(visitId, {
  status, actor = null, note = null, cancelReason = null,
  scheduledAt = null, outcome = null, outcomeNote = null,
}) {
  if (status && !isValidStatus(status)) {
    throw new Error(`"${status}" is not a site visit status.`);
  }

  const existing = await prisma.siteVisit.findUnique({ where: { id: visitId } });
  if (!existing) throw new Error('That site visit no longer exists.');

  const data = { };
  if (status) {
    data.status = status;
    if (isTerminal(status)) data.remindersOff = true;
  }
  if (cancelReason !== null) data.cancelReason = cancelReason;
  if (outcome !== null) data.outcome = outcome;
  if (outcomeNote !== null) data.outcomeNote = outcomeNote;
  if (note !== null) data.note = note;

  /* A reschedule keeps the old time: "moved from" is the thing the customer
     and the team actually need to read in the message that follows. */
  if (scheduledAt) {
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime())) throw new Error('A site visit needs a valid date and time.');
    data.previousAt = existing.scheduledAt;
    data.scheduledAt = when;
    /* A new time means the reminders for the old one were never sent for this
       time. Clearing the flag lets the sweep pick the visit up again; the
       per-event rows keep the already-sent ones from repeating. */
    data.remindersOff = status ? isTerminal(status) : false;
  }

  const visit = await prisma.siteVisit.update({ where: { id: visitId }, data });

  // Mirror onto the lead, as scheduling does.
  const leadData = { siteVisitStatus: visit.status };
  if (scheduledAt) leadData.siteVisitDate = visit.scheduledAt;
  if (status === 'Confirmed') leadData.siteVisitConfirmedDate = new Date();
  if (status === 'Completed') leadData.siteVisitDoneDate = visit.checkOutAt || new Date();
  await prisma.lead.update({ where: { id: visit.leadId }, data: leadData })
    .catch((error) => console.error('Could not mirror the visit onto the lead:', error.message));

  await writeTimeline(visit.leadId, {
    title: `Site visit ${String(visit.status).toLowerCase()}`,
    subtitle: buildTransitionLine(existing, visit, { cancelReason, outcome }),
    field: 'siteVisitStatus',
    oldValue: existing.status,
    newValue: visit.status,
    actor,
  });

  return visit;
}

/** Arrival and departure. Check-out completes the visit; check-in starts it. */
async function checkIn(visitId, { actor = null, at = new Date() } = {}) {
  const visit = await prisma.siteVisit.update({
    where: { id: visitId },
    data: { checkInAt: at, checkInBy: actor, status: 'In Progress' },
  });
  await prisma.lead.update({ where: { id: visit.leadId }, data: { siteVisitStatus: 'In Progress' } })
    .catch(() => { });
  await writeTimeline(visit.leadId, {
    title: 'Site visit started',
    subtitle: `${actor || 'Someone'} checked in at ${formatVisitTime(at, visit.timezone)}.`,
    actor,
  });
  return visit;
}

async function checkOut(visitId, { actor = null, at = new Date(), outcome = null, outcomeNote = null } = {}) {
  const existing = await prisma.siteVisit.findUnique({ where: { id: visitId } });
  if (!existing) throw new Error('That site visit no longer exists.');

  const visit = await prisma.siteVisit.update({
    where: { id: visitId },
    data: {
      checkOutAt: at,
      checkOutBy: actor,
      status: 'Completed',
      remindersOff: true,      // finished: nothing further is due
      outcome: outcome ?? undefined,
      outcomeNote: outcomeNote ?? undefined,
    },
  });

  await prisma.lead.update({
    where: { id: visit.leadId },
    data: { siteVisitStatus: 'Completed', siteVisitDoneDate: at, siteVisitDoneNote: outcomeNote ?? undefined },
  }).catch(() => { });

  const minutes = existing.checkInAt
    ? Math.max(0, Math.round((at - new Date(existing.checkInAt)) / 60000))
    : null;

  await writeTimeline(visit.leadId, {
    title: 'Site visit completed',
    subtitle: `${actor || 'Someone'} checked out at ${formatVisitTime(at, visit.timezone)}`
      + `${minutes !== null ? ` · on site ${minutes} min` : ''}`
      + `${outcome ? ` · outcome: ${outcome}` : ''}`,
    actor,
  });

  await recordActivity(visit, {
    type: 'Site Visit',
    subject: 'Site visit completed',
    outcome,
    description: outcomeNote,
    createdBy: actor,
    occurredAt: at,
  });

  return visit;
}

/**
 * A follow-up task off the back of a visit.
 *
 * Uses the Task table the rest of the CRM already uses rather than a
 * visit-specific one, so it shows up wherever tasks show up.
 */
async function createFollowUpTask(visit, { title, dueDate, assignedTo, createdBy, description }) {
  return prisma.task.create({
    data: {
      entityType: 'lead',
      entityId: visit.leadId,
      title: title || `Follow up on the site visit at ${visit.projectName || 'the project'}`,
      description: description || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      assignedTo: assignedTo || visit.assignedToId || null,
      createdBy: createdBy || null,
      status: 'Open',
    },
  });
}

/** The CRM's own activity feed, so a visit appears where every touch appears. */
async function recordActivity(visit, { type, subject, description, outcome, createdBy, occurredAt }) {
  try {
    return await prisma.activity.create({
      data: {
        entityType: 'lead',
        entityId: visit.leadId,
        type: type || 'Site Visit',
        subject: subject || 'Site visit',
        description: description || null,
        outcome: outcome || null,
        occurredAt: occurredAt || visit.scheduledAt,
        createdBy: createdBy || null,
        assignedTo: visit.assignedToId || null,
        status: isTerminal(visit.status) ? 'Completed' : 'Planned',
      },
    });
  } catch (error) {
    console.error('Could not record the site visit activity:', error.message);
    return null;
  }
}

/** The lead's own timeline. Never throws: history must not fail a save. */
async function writeTimeline(leadId, data) {
  try {
    await prisma.leadLog.create({ data: { leadId, ...data } });
  } catch (error) {
    console.error('Could not write the site visit timeline entry:', error.message);
  }
}

function buildTransitionLine(before, after, { cancelReason, outcome }) {
  const bits = [`${before.status} → ${after.status}`];
  if (after.previousAt && String(after.previousAt) !== String(before.previousAt)) {
    bits.push(`moved from ${formatVisitTime(after.previousAt, after.timezone)} `
      + `to ${formatVisitTime(after.scheduledAt, after.timezone)}`);
  }
  if (cancelReason) bits.push(`reason: ${cancelReason}`);
  if (outcome) bits.push(`outcome: ${outcome}`);
  if (after.remindersOff && !before.remindersOff) bits.push('reminders stopped');
  return `${bits.join(' · ')}.`;
}

/**
 * A date a person can read, in the zone the visit was agreed in.
 *
 * Falls back to a plain ISO string rather than throwing if the stored zone is
 * not one this Node build knows — a malformed zone must not stop a reminder.
 */
function formatVisitTime(date, timezone = DEFAULT_TIMEZONE) {
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: timezone || DEFAULT_TIMEZONE,
    }).format(new Date(date));
  } catch {
    return new Date(date).toISOString();
  }
}

module.exports = {
  STATUSES,
  TERMINAL_STATUSES,
  DEFAULT_TIMEZONE,
  isTerminal,
  isValidStatus,
  gatherVisitDetails,
  internalRecipients,
  scheduleVisit,
  transitionVisit,
  checkIn,
  checkOut,
  createFollowUpTask,
  recordActivity,
  formatVisitTime,
};
