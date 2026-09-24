/**
 * The numbers behind an opportunity's health.
 *
 * All derived, none stored. A weighted value kept in a column is a value that
 * can disagree with the two figures it comes from the moment either changes;
 * computing it on read means it never can. The same goes for days in stage,
 * the score and the risk band.
 *
 * Computed here rather than in the page so the list, the dashboard and the
 * record cannot each arrive at a different answer.
 */

/** The pipeline, in order. Anything unrecognised sits at the start. */
const STAGE_ORDER = [
  'Site Visit Converted', 'Initiate', 'Booking Done',
  'Negotiation', 'Closed Won', 'Closed Lost',
];

/** A sensible probability for a stage, when nobody has set one. */
const STAGE_PROBABILITY = {
  'Site Visit Converted': 20,
  Initiate: 35,
  'Booking Done': 60,
  Negotiation: 75,
  'Closed Won': 100,
  'Closed Lost': 0,
};

const DAY = 86400000;

/** Whole days between two instants, never negative for a past date. */
const daysBetween = (from, to = new Date()) => {
  if (!from) return null;
  const start = new Date(from).getTime();
  if (Number.isNaN(start)) return null;
  return Math.floor((to.getTime() - start) / DAY);
};

/** Prisma Decimal, a string, or null — as a number or null. */
const asNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Everything the health panel shows, for one opportunity.
 *
 * Counts come from the caller, which reads them out of the database. Nothing
 * here invents a figure: where a value is missing it is reported as missing,
 * and where one is assumed it is returned separately so the page can say so.
 *
 * @param {object} opportunity  the record
 * @param {object} [counts]     measured from the shared sub-record tables
 * @returns {object} derived figures — never persisted
 */
function summarise(opportunity, counts = {}) {
  const o = opportunity || {};
  const closed = /^Closed/i.test(o.stage || '') || ['Won', 'Lost'].includes(o.status);

  /* ---- value ------------------------------------------------------------
     In order of authority: the figure somebody entered, then what the products
     on the record add up to, then the booking amount. Whichever is used is
     named, so the page never shows a number without saying where it came
     from. */
  let value = asNumber(o.expectedValue);
  let valueSource = value === null ? null : 'Expected value';
  if (value === null && counts.lineItemTotal) {
    value = counts.lineItemTotal;
    valueSource = `${counts.lineItems} product${counts.lineItems === 1 ? '' : 's'} on this record`;
  }
  if (value === null) {
    value = asNumber(o.bookingAmount);
    if (value !== null) valueSource = 'Booking amount';
  }

  /* The stored probability, and separately the one this stage usually carries.
     Substituting the second for the first put a number on screen that nobody
     had entered. */
  const probability = o.probability ?? null;
  const assumedProbability = STAGE_PROBABILITY[o.stage] ?? null;

  /* Weighted only from figures that are real. A weighting built on an assumed
     probability is a guess wearing a rupee sign. */
  const weighted = value !== null && probability !== null
    ? Math.round(value * (probability / 100))
    : null;

  /* ---- time ------------------------------------------------------------- */
  const age = daysBetween(o.createdAt);
  // Falls back to the record's age: an opportunity that has never changed
  // stage has been in this one since it existed.
  const daysInStage = daysBetween(o.stageEnteredAt || o.createdAt);
  const daysToClose = o.expectedCloseDate
    ? Math.ceil((new Date(o.expectedCloseDate).getTime() - Date.now()) / DAY)
    : null;
  /* Measured from real activity rows. It used to fall back to updatedAt,
     which meant saving the record counted as working it. */
  const lastActivityAt = counts.lastActivityAt || o.lastActivityAt || null;
  const daysSinceActivity = daysBetween(lastActivityAt);

  /* ---- engagement and risk ---------------------------------------------- */
  /* No activity is its own answer, distinct from activity long ago. */
  let engagement = 'No activity recorded';
  if (daysSinceActivity !== null) {
    if (daysSinceActivity <= 3) engagement = 'High';
    else if (daysSinceActivity <= 14) engagement = 'Medium';
    else engagement = 'Low';
  }

  const risks = [];
  if (!closed) {
    if (daysSinceActivity === null) risks.push('No activity has ever been recorded');
    else if (daysSinceActivity > 14) risks.push('No activity for over a fortnight');
    if (probability === null) risks.push('No probability set, so the forecast is an assumption');
    if (counts.overdueTasks) risks.push(`${counts.overdueTasks} overdue task(s)`);
    if (daysToClose !== null && daysToClose < 0) risks.push('Past its expected close date');
    if (daysInStage !== null && daysInStage > 30) risks.push('Over a month in the same stage');
    if (value === null) risks.push('No value set, so it cannot be forecast');
    if (!o.expectedCloseDate) risks.push('No expected close date');
  }
  const risk = closed ? 'None' : risks.length >= 3 ? 'High' : risks.length >= 1 ? 'Medium' : 'Low';

  /* ---- the score --------------------------------------------------------
     Out of 100, from things that are actually known: how far along it is, how
     likely, how recently touched, and whether it is properly filled in. Every
     part is named in `scoreParts` so a low score can be explained rather than
     just displayed. */
  const stageIndex = STAGE_ORDER.indexOf(o.stage);
  const progress = stageIndex >= 0 ? stageIndex / (STAGE_ORDER.length - 1) : 0;

  const scoreParts = {
    progress: Math.round(progress * 30),
    // Only a probability somebody set earns points. Scoring the assumption
    // would mean the score rose when the stage changed and nothing else did.
    probability: probability !== null ? Math.round((probability / 100) * 30) : 0,
    recency: daysSinceActivity === null ? 0
      : daysSinceActivity <= 3 ? 25
        : daysSinceActivity <= 7 ? 18
          : daysSinceActivity <= 14 ? 10
            : daysSinceActivity <= 30 ? 4 : 0,
    completeness: [value !== null, Boolean(o.expectedCloseDate), Boolean(o.opportunityOwner), Boolean(o.nextAction)]
      .filter(Boolean).length * 3.75,
  };
  const score = Math.min(100, Math.round(Object.values(scoreParts).reduce((a, b) => a + b, 0)));

  const health = score >= 70 ? 'Healthy' : score >= 40 ? 'Needs attention' : 'At risk';

  /* ---- forecast ---------------------------------------------------------- */
  const forecast = o.stage === 'Closed Won' ? 'Won'
    : o.stage === 'Closed Lost' ? 'Lost'
      : probability !== null && probability >= 70 ? 'Commit'
        : probability !== null && probability >= 40 ? 'Best case'
          : 'Pipeline';

  return {
    value,
    valueSource,
    currency: o.currency || 'INR',
    probability,
    assumedProbability,
    weighted,
    lastActivityAt,
    // Straight counts out of the database, for the page to show as they are.
    counts: {
      activities: counts.activities ?? 0,
      tasks: counts.tasks ?? 0,
      openTasks: counts.openTasks ?? 0,
      overdueTasks: counts.overdueTasks ?? 0,
      notes: counts.notes ?? 0,
      contacts: counts.contacts ?? 0,
      documents: counts.documents ?? 0,
      products: counts.lineItems ?? 0,
    },
    stage: o.stage || null,
    stageIndex,
    stageOrder: STAGE_ORDER,
    closed,
    age,
    daysInStage,
    daysToClose,
    daysSinceActivity,
    engagement,
    risk,
    risks,
    score,
    scoreParts,
    health,
    forecast,
  };
}

module.exports = { summarise, STAGE_ORDER, STAGE_PROBABILITY };
