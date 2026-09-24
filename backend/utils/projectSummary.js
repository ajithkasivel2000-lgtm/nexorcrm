/**
 * A project's figures, counted rather than claimed.
 *
 * Every number comes from a query. Where there is nothing to count the field
 * is null and the page says so — a zero and "not tracked yet" mean different
 * things, and showing the first for the second is how a dashboard starts
 * lying.
 *
 * Inventory is counted from units once Phase 2 lands. Until then `units` is
 * null rather than 0, so the page can distinguish "no inventory recorded" from
 * "every unit is sold".
 */
const prisma = require('../prismaClient');
const { inventoryFor } = require('../controllers/projectInventoryController');

/** Unit states, in the order a sale moves through them. */
const UNIT_STATES = ['Available', 'Hold', 'Reserved', 'Booked', 'Sold', 'Blocked', 'Cancelled'];

/** Prisma Decimal, string, or null — as a number or null. */
const asNumber = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);

/**
 * Everything the project overview shows.
 *
 * @param {object} project
 * @returns {Promise<object>} derived figures — never persisted
 */
async function summariseProject(project) {
  const p = project || {};
  const where = { entityType: 'project', entityId: p.id };
  const now = new Date();

  /* ---- what is hanging off the project ---------------------------------- */
  const [activities, latestActivity, tasks, openTasks, overdueTasks, notes, contacts, documents, history] =
    await Promise.all([
      prisma.activity.count({ where }),
      prisma.activity.findFirst({ where, orderBy: { occurredAt: 'desc' }, select: { occurredAt: true } }),
      prisma.task.count({ where }),
      prisma.task.count({ where: { ...where, status: { not: 'Completed' } } }),
      prisma.task.count({ where: { ...where, status: { not: 'Completed' }, dueDate: { lt: now } } }),
      prisma.note.count({ where }),
      prisma.contact.count({ where }),
      prisma.document.count({ where }),
      prisma.stageHistory.findMany({ where, orderBy: { enteredAt: 'asc' } }),
    ]);

  /* ---- the CRM records that name this project ----------------------------
     Leads and opportunities hold the project as a string that may be its id or
     its name, so both are matched. No foreign key exists to follow. */
  const names = [p.id, p.projectName].filter(Boolean);
  const [leadRows, oppRows] = await Promise.all([
    names.length
      ? prisma.lead.findMany({ where: { project: { in: names } }, select: { status: true } })
      : [],
    names.length
      ? prisma.opportunity.findMany({
        where: { LeadsProject: { in: names } },
        select: { stage: true, status: true, expectedValue: true, bookingAmount: true },
      })
      : [],
  ]);

  const leadsByStatus = leadRows.reduce((acc, l) => {
    const key = l.status || 'Unset';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const won = oppRows.filter((o) => o.status === 'Won' || o.stage === 'Closed Won');
  const lost = oppRows.filter((o) => o.status === 'Lost' || o.stage === 'Closed Lost');
  const open = oppRows.filter((o) => !won.includes(o) && !lost.includes(o));
  const valueOf = (rows) => rows.reduce((sum, o) => sum + (asNumber(o.expectedValue) ?? asNumber(o.bookingAmount) ?? 0), 0);

  /* ---- inventory ---------------------------------------------------------
     Phase 2 adds the units table. Until it exists there is nothing to count,
     and null says that honestly — unlike a row of zeros, which would read as
     a project with no units left. */
  const inventory = await inventoryFor(p.id);

  /* ---- progress ----------------------------------------------------------
     Construction progress is entered by hand; sales progress needs inventory,
     so it stays null until there is some. */
  const constructionProgress = p.constructionProgress ?? null;
  const salesProgress = inventory ? inventory.salesProgress : null;

  const daysSince = (d) => (d ? Math.floor((now - new Date(d)) / 86400000) : null);

  /* ---- what is missing, said plainly ------------------------------------- */
  const gaps = [];
  if (!p.projectCode) gaps.push('No project code');
  if (!p.city) gaps.push('No city set');
  if (!p.reraNumber) gaps.push('No RERA number');
  if (asNumber(p.startingPrice) === null) gaps.push('No starting price');
  if (!p.expectedCompletion) gaps.push('No expected completion date');
  if (!p.projectManager) gaps.push('No project manager assigned');

  return {
    /* Counted */
    counts: {
      activities, tasks, openTasks, overdueTasks, notes, contacts, documents,
      leads: leadRows.length,
      opportunities: oppRows.length,
    },
    lastActivityAt: latestActivity?.occurredAt || null,

    /* Inventory — null until Phase 2 */
    inventory,
    unitStates: UNIT_STATES,

    /* CRM */
    crm: {
      leads: leadRows.length,
      opportunities: oppRows.length,
      leadsByStatus,
      openOpportunities: open.length,
      wonOpportunities: won.length,
      lostOpportunities: lost.length,
      conversionRate: pct(won.length, oppRows.length),
      pipelineValue: open.length ? valueOf(open) : null,
      wonValue: won.length ? valueOf(won) : null,
    },

    /* Progress */
    constructionProgress,
    salesProgress,

    /* Timings */
    age: daysSince(p.createdAt),
    daysToCompletion: p.expectedCompletion
      ? Math.ceil((new Date(p.expectedCompletion) - now) / 86400000)
      : null,
    daysSinceActivity: daysSince(latestActivity?.occurredAt),

    /* Money that is set on the project itself */
    startingPrice: asNumber(p.startingPrice),
    pricePerSqft: asNumber(p.pricePerSqft),
    currency: 'INR',

    status: p.projectStatus || null,
    archived: Boolean(p.archivedAt),
    gaps,
    history,
  };
}

module.exports = { summariseProject, UNIT_STATES };
