/**
 * What a lead is worth paying attention to, and why.
 *
 * Every number here is derived from data the CRM actually holds — no invented
 * signals, no model. Each contribution carries the reason it was awarded, so a
 * score of 62 can be read as the six things that produced it rather than being
 * a number nobody can argue with.
 *
 * Nothing is stored. A score in a column is stale the moment anything it was
 * built from changes.
 */
const { stageForStatus, isClosedStage, STAGES, stageIndex } = require('./leadStages');

const DAY = 86400000;

/** Whole days since an instant, or null when there is no instant. */
const daysSince = (value) => {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DAY);
};

/** Days until an instant; negative once it is past. */
const daysUntil = (value) => {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / DAY);
};

/** A number out of free text, or null. */
const asNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const looksLikeEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

/**
 * How promising a source is.
 *
 * A referral converts better than a bought list, and that is worth points. The
 * bands are keyword-matched because the source list is a master table people
 * edit — an unrecognised source scores the middle rather than zero, since
 * "we have not classified this yet" is not the same as "this is a bad lead".
 */
const SOURCE_BANDS = [
  [/referr|word of mouth|existing customer/i, 15, 'Referral — the best-converting source'],
  [/channel partner|broker|agent/i, 12, 'Channel partner'],
  [/walk.?in|direct|showroom/i, 12, 'Walked in directly'],
  [/website|web|organic|seo/i, 9, 'Came through the website'],
  [/campaign|google|meta|facebook|instagram|ads?\b/i, 7, 'Paid campaign'],
  [/portal|99acres|magicbricks|housing/i, 6, 'Property portal'],
  [/bulk|purchased|list|cold/i, 3, 'Bought or cold list'],
];

/**
 * Scores a lead out of 100, in six named parts.
 *
 * @param {object} lead
 * @param {object} [context]
 * @param {number} [context.activityCount]   activities in the last 30 days
 * @param {Date}   [context.lastActivityAt]  most recent activity of any kind
 * @param {number} [context.openTasks]
 * @returns {{score:number, band:string, parts:object, reasons:object[]}}
 */
function scoreLead(lead, context = {}) {
  const o = lead || {};
  const reasons = [];
  const parts = {};

  /** Records a contribution and the sentence explaining it. */
  const award = (bucket, points, why) => {
    parts[bucket] = (parts[bucket] || 0) + points;
    if (points !== 0) reasons.push({ bucket, points, why });
  };

  /* ---- Demographic /15 — can we reach them, and who are they? ----------- */
  parts.demographic = 0;
  if (looksLikeEmail(o.email)) award('demographic', 6, 'Email address on file');
  else if (o.email) award('demographic', 2, 'Email present but malformed');
  if (o.mobile) award('demographic', 5, 'Mobile number on file');
  if (o.alternateNo || o.alternateEmail) award('demographic', 2, 'A second way to reach them');
  if (o.companyName || o.occupation) award('demographic', 2, 'Company or occupation known');

  /* ---- Source /15 -------------------------------------------------------- */
  parts.source = 0;
  const source = o.primarySource || '';
  const band = SOURCE_BANDS.find(([re]) => re.test(source));
  if (band) award('source', band[1], band[2]);
  else if (source) award('source', 8, `Source "${source}" is not classified yet`);

  /* ---- Requirement /15 --------------------------------------------------- */
  parts.requirement = 0;
  if (o.project) award('requirement', 9, 'Interested in a specific project');
  if (o.otherNotes || o.additionalRemarks) award('requirement', 3, 'Requirement notes captured');
  if (o.virtualVisit || o.virtualVisitDate) award('requirement', 3, 'Asked about a virtual visit');

  /* ---- Budget /15 -------------------------------------------------------- */
  parts.budget = 0;
  const budget = asNumber(o.budgetLimit);
  if (budget !== null && budget > 0) award('budget', 15, `Budget stated (${budget.toLocaleString('en-IN')})`);
  else if (o.budgetLimit) award('budget', 5, 'Budget mentioned but not a figure');

  /* ---- Engagement /20 — have they responded, and recently? --------------- */
  parts.engagement = 0;
  const recent = context.activityCount ?? 0;
  if (recent >= 5) award('engagement', 14, `${recent} activities in the last 30 days`);
  else if (recent >= 2) award('engagement', 10, `${recent} activities in the last 30 days`);
  else if (recent === 1) award('engagement', 5, 'One activity in the last 30 days');

  const quiet = daysSince(context.lastActivityAt || o.updatedAt);
  if (quiet !== null) {
    if (quiet <= 2) award('engagement', 6, 'Touched in the last two days');
    else if (quiet <= 7) award('engagement', 3, `Last touched ${quiet} days ago`);
    else if (quiet > 14) award('engagement', -10, `No activity for ${quiet} days`);
    else if (quiet > 7) award('engagement', -5, `No activity for ${quiet} days`);
  }

  /* ---- Behaviour /20 — how far have they actually got? ------------------- */
  parts.behaviour = 0;
  const stage = stageForStatus(o.status);
  const idx = stageIndex(stage);
  if (idx > 0) award('behaviour', Math.min(14, idx * 4), `Reached ${stage}`);
  if (o.siteVisitDoneDate) award('behaviour', 6, 'Has been on a site visit');
  else if (o.siteVisitDate || o.siteVisitConfirmedDate) award('behaviour', 3, 'A site visit is booked');

  const rating = String(o.rating || '').toLowerCase();
  if (rating === 'hot') award('behaviour', 4, 'Rated hot');
  else if (rating === 'cold') award('behaviour', -4, 'Rated cold');

  /* ---- a dead lead scores nothing, whatever else is true ----------------- */
  if (isClosedStage(stage)) {
    const total = Object.values(parts).reduce((a, b) => a + b, 0);
    return {
      score: 0,
      band: stage === 'Lost' ? 'Lost' : stage,
      parts,
      reasons: [{ bucket: 'behaviour', points: -total, why: `${o.status} — no longer in play` }, ...reasons],
    };
  }

  const raw = Object.values(parts).reduce((a, b) => a + b, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const bandName = score >= 75 ? 'Hot' : score >= 50 ? 'Warm' : score >= 25 ? 'Cool' : 'Cold';

  return { score, band: bandName, parts, reasons };
}

/**
 * The health read: engagement, responsiveness, follow-up and risk.
 *
 * Separate from the score on purpose. A lead can score well and still be in
 * trouble — a big budget nobody has called for a fortnight — and one number
 * hides that.
 */
function healthOf(lead, context = {}, scored) {
  const o = lead || {};
  const stage = stageForStatus(o.status);
  const closed = isClosedStage(stage);

  const quiet = daysSince(context.lastActivityAt || o.updatedAt);
  const followUpIn = daysUntil(o.followUpDate);

  const engagement = quiet === null ? 'Unknown'
    : quiet <= 3 ? 'High' : quiet <= 14 ? 'Medium' : 'Low';

  const responded = Boolean(o.callStatus && !/not reachable|no answer|switched off/i.test(o.callStatus));
  const responseStatus = !o.callStatus ? 'Not attempted'
    : responded ? 'Responded' : `No response (${o.callStatus})`;

  const followUp = !o.followUpDate ? 'None set'
    : followUpIn < 0 ? `Overdue by ${Math.abs(followUpIn)} day${Math.abs(followUpIn) === 1 ? '' : 's'}`
      : followUpIn === 0 ? 'Due today'
        : `Due in ${followUpIn} day${followUpIn === 1 ? '' : 's'}`;

  const concerns = [];
  if (!closed) {
    if (quiet !== null && quiet > 14) concerns.push(`No activity for ${quiet} days`);
    if (followUpIn !== null && followUpIn < 0) concerns.push('Follow-up is overdue');
    if (!o.followUpDate) concerns.push('No follow-up date set');
    if (!o.owner) concerns.push('Nobody owns this lead');
    if (context.overdueTasks) concerns.push(`${context.overdueTasks} overdue task(s)`);
  }

  const risk = closed ? 'None'
    : concerns.length >= 3 ? 'High' : concerns.length >= 1 ? 'Medium' : 'Low';

  const health = closed ? 'Closed'
    : scored.score >= 70 && risk !== 'High' ? 'Healthy'
      : scored.score >= 40 ? 'Needs attention' : 'At risk';

  /* Conversion probability, from where it is and how it is doing. The stage
     sets the base — a lead at Qualified converts more often than one at New —
     and the score nudges it either way. Stated as a band, not a decimal: the
     data does not support two significant figures. */
  const base = [10, 20, 35, 55, 75, 95][Math.max(0, stageIndex(stage))] ?? 10;
  const conversion = closed ? 0 : Math.max(5, Math.min(95, Math.round(base + (scored.score - 50) * 0.3)));

  return {
    stage,
    stageIndex: stageIndex(stage),
    stages: STAGES,
    closed,
    engagement,
    responseStatus,
    followUp,
    followUpIn,
    daysSinceActivity: quiet,
    leadAge: daysSince(o.createdAt),
    risk,
    concerns,
    health,
    conversion,
  };
}

/**
 * What to do about it.
 *
 * One recommendation, chosen by the most pressing thing that is true. Ordered
 * deliberately: an overdue follow-up outranks a missing budget, because one is
 * a promise already broken and the other is a gap.
 */
function nextBestAction(lead, health, scored) {
  const o = lead || {};
  if (health.closed) return { action: 'Nothing to do — this lead is closed.', urgency: 'none' };

  if (!o.owner) {
    return { action: 'Assign an owner. Nobody is working this lead.', urgency: 'high' };
  }
  if (health.followUpIn !== null && health.followUpIn < 0) {
    return { action: `Follow up now — it was due ${Math.abs(health.followUpIn)} day(s) ago.`, urgency: 'high' };
  }
  if (health.daysSinceActivity !== null && health.daysSinceActivity > 14) {
    return {
      action: scored.score >= 60
        ? `Call today. Strong lead (${scored.score}/100) with no contact for ${health.daysSinceActivity} days.`
        : `Make contact or close it — nothing has happened for ${health.daysSinceActivity} days.`,
      urgency: 'high',
    };
  }
  if (!o.followUpDate) {
    return { action: 'Set a follow-up date so this does not go quiet.', urgency: 'medium' };
  }
  if (!o.project) {
    return { action: 'Find out which project they want — it drives everything else.', urgency: 'medium' };
  }
  if (!asNumber(o.budgetLimit)) {
    return { action: 'Ask about budget. It is the biggest gap in this lead.', urgency: 'medium' };
  }
  if (!o.siteVisitDate && !o.siteVisitDoneDate && scored.score >= 50) {
    return { action: 'Book a site visit — this lead is warm enough for one.', urgency: 'medium' };
  }
  if (health.followUpIn === 0) {
    return { action: 'Follow-up is due today.', urgency: 'medium' };
  }
  return { action: 'On track. Keep to the follow-up date.', urgency: 'low' };
}

/** Everything the insights panel shows, for one lead. */
function summariseLead(lead, context = {}) {
  const scored = scoreLead(lead, context);
  const health = healthOf(lead, context, scored);
  return {
    ...scored,
    ...health,
    recommendation: nextBestAction(lead, health, scored),
    activityCount: context.activityCount ?? 0,
    openTasks: context.openTasks ?? 0,
    overdueTasks: context.overdueTasks ?? 0,
  };
}

module.exports = { summariseLead, scoreLead, healthOf, nextBestAction };
