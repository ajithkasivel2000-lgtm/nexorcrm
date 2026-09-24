/**
 * Where a lead sits in the funnel, derived rather than stored.
 *
 * The statuses are a master table people edit, so the funnel cannot be a
 * second column holding the same fact — two sources of truth that drift the
 * first time somebody sets one without the other. A lead has a status; the
 * stage is worked out from it.
 *
 * Adding a status to the master needs one line here. Until it gets one it maps
 * to `null`, which the page shows as "not in the funnel" — visibly unmapped,
 * rather than silently claiming the lead is at the beginning.
 */

/** The funnel, in order. */
const STAGES = ['New', 'Contacted', 'Engaged', 'Qualified', 'Opportunity', 'Customer'];

/** Statuses that end a lead rather than advancing it. */
const CLOSED_STAGES = ['Lost', 'Junk', 'Disqualified', 'On Hold'];

/**
 * Status to stage.
 *
 * Keyed lowercase so "Site Visit" and "site visit" land together, and matched
 * on the whole string first, then by keyword — a master this editable will
 * grow statuses nobody listed here.
 */
const STATUS_STAGE = {
  'new lead': 'New',
  new: 'New',
  attempted: 'Contacted',
  contacted: 'Contacted',
  interested: 'Engaged',
  allocate: 'Engaged',
  allocated: 'Engaged',
  'site visit': 'Qualified',
  qualified: 'Qualified',
  negotiation: 'Qualified',
  opportunity: 'Opportunity',
  converted: 'Opportunity',
  customer: 'Customer',
  won: 'Customer',
  // The ways a lead stops.
  rejected: 'Lost',
  lost: 'Lost',
  duplicate: 'Junk',
  'possible duplicate': 'Junk',
  junk: 'Junk',
  invalid: 'Disqualified',
  disqualified: 'Disqualified',
  'on hold': 'On Hold',
};

/** Keyword fallbacks, for a status nobody has mapped yet. */
const KEYWORD_STAGE = [
  [/duplicat/, 'Junk'],
  [/reject|lost|dead/, 'Lost'],
  [/invalid|disqualif/, 'Disqualified'],
  [/hold/, 'On Hold'],
  [/customer|won|booked/, 'Customer'],
  [/opportunit|convert/, 'Opportunity'],
  [/visit|qualif|negotiat/, 'Qualified'],
  [/interest|engag|allocat/, 'Engaged'],
  [/attempt|contact|call/, 'Contacted'],
  [/new|open/, 'New'],
];

/**
 * The stage for a status, or null when it maps to nothing.
 *
 * Null is deliberate: an unmapped status should read as unmapped, not as the
 * start of the funnel.
 */
function stageForStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  if (!s) return null;
  if (STATUS_STAGE[s]) return STATUS_STAGE[s];
  const hit = KEYWORD_STAGE.find(([re]) => re.test(s));
  return hit ? hit[1] : null;
}

/** Whether this stage means the lead is finished with, one way or another. */
const isClosedStage = (stage) => CLOSED_STAGES.includes(stage);

/** Position in the funnel, or -1 for closed and unmapped stages. */
const stageIndex = (stage) => STAGES.indexOf(stage);

/**
 * Writes a funnel move, if the status change was one.
 *
 * Only when the stage actually differs: two statuses can share a stage, and a
 * timeline full of moves that went nowhere is worse than no timeline.
 *
 * Never throws. A lead that saved must not fail because its history did not.
 */
async function recordStageMove(prisma, { entityId, fromStatus, toStatus, actor }) {
  const from = stageForStatus(fromStatus);
  const to = stageForStatus(toStatus);
  if (!to || from === to) return null;

  try {
    return await prisma.stageHistory.create({
      data: {
        entityType: 'lead',
        entityId,
        fromStage: from,
        toStage: to,
        changedBy: actor || null,
        note: fromStatus || toStatus ? `${fromStatus || '(none)'} → ${toStatus}` : null,
      },
    });
  } catch (error) {
    console.error('Could not record the lead stage move:', error.message);
    return null;
  }
}

module.exports = {
  STAGES, CLOSED_STAGES, stageForStatus, isClosedStage, stageIndex, recordStageMove,
};
