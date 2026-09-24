/**
 * Record ids: PREFIX-YEAR-NUMBER, e.g. USR-2026-001.
 *
 * This is the primary key itself, not a column beside it. The database used to
 * carry three conventions at once — a readable key on some tables
 * (ENQ-2026-000001), a uuid plus a readable column on others, a random suffix
 * on a third group (CP_892491) — so an id told you nothing about what it was.
 *
 * Numbering restarts each year, which is the point of the year being in there:
 * USR-2026-001 is the first user of 2026 regardless of how many came before.
 */

/** Three letters per table, distinct enough to tell apart at a glance. */
const PREFIXES = {
  lead: 'LED',
  opportunity: 'OPP',
  customer: 'CUS',
  user: 'USR',
  userGroup: 'UGR',
  channelPartner: 'CHP',
  project: 'PRJ',
  projectBuilding: 'BLD',
  projectUnit: 'UNT',
  leads: 'ENQ',
  // Prisma lowercases only the first letter, so model RRQ is exposed as rRQ.
  rRQ: 'RRQ',
  rRQType: 'RQT',
  emailTemplate: 'EMT',
  leadStatus: 'LST',
  openReason: 'OPR',
  callStatus: 'CLS',
  leadType: 'LTP',
  projectStatus: 'PST',
  projectType: 'PTP',
  primarySource: 'PSR',
  secondarySource: 'SSR',
  tertiarySource: 'TSR',
  notification: 'NTF',
  chatConversation: 'CHT',
  chatRoom: 'ROM',
  // Shared sub-records, used by leads and opportunities alike.
  activity: 'ACT',
  task: 'TSK',
  note: 'NOT',
  contact: 'CNT',
  document: 'DOC',
  lineItem: 'LIT',
  competitor: 'CMP',
  risk: 'RSK',
  stageHistory: 'STH',
  chatRoomMember: 'RMB',
  chatRoomMessage: 'RMG',
  chatMessage: 'CHM',
  leadLog: 'LLG',
  opportunityLog: 'OLG',
  channelPartnerLog: 'CLG',
  systemLog: 'SLG',
  // No 'session' prefix: a session's id IS its bearer token, so it must be
  // unguessable — see prismaClient.js. A readable SES-2026-001 let anyone
  // sign in as anyone by counting.
  department: 'DEP',
  userAuditLog: 'UAL',
  userStatusHistory: 'USH',
  userPreference: 'UPF',
  serviceSection: 'SSC',
  mailSetting: 'MST',
  sessionSetting: 'SST',
  securitySetting: 'SCS',
  registrationSetting: 'RST',
  globalUserSetting: 'GUS',
  booking: 'BKG',
  paymentMilestone: 'PMS',
  payment: 'PAY',
  commission: 'COM',
  whatsAppMessage: 'WAM',
  leadIntegration: 'LIN',
  callLog: 'CAL',
  scheduledReport: 'RPT',
  emailOutbox: 'EML',
};

/**
 * Columns that repeat the id under an older name — `oppId`, `cpId` and the
 * rest. The screens still read them and they are NOT NULL + unique, so each is
 * filled with the id itself. Keeping them but letting them drift back to
 * CP_892491 would put two formats on one record, which is the thing this is
 * meant to end.
 */
const MIRROR_FIELDS = {
  channelPartner: 'cpId',
  customer: 'customerId',
  opportunity: 'oppId',
  rRQ: 'rrqId',
  emailTemplate: 'templateId',
};

/** The legacy column for a model, or null when it has none. */
function mirrorFor(model) {
  return MIRROR_FIELDS[model] || null;
}

/** The smallest number of digits; a table that outgrows it simply gets more. */
const MIN_DIGITS = 3;

/** Matches an id this module produced, and captures its parts. */
const PATTERN = /^([A-Z]{3})-(\d{4})-(\d+)$/;

/** The prefix for a model, or null when that model has none. */
function prefixFor(model) {
  return PREFIXES[model] || null;
}

/**
 * The highest number already used by a table this year, or 0 for a fresh one.
 *
 * Sorting the ids as strings would only be safe while every number has the
 * same width, and the width grows once a table passes 999, so the maximum is
 * taken numerically instead.
 */
async function highestNumber(prisma, model, year) {
  const stem = `${prefixFor(model)}-${year}-`;
  const rows = await prisma[model].findMany({
    where: { id: { startsWith: stem } },
    select: { id: true },
  });

  let highest = 0;
  for (const row of rows) {
    const m = PATTERN.exec(row.id || '');
    if (!m) continue;
    const n = parseInt(m[3], 10);
    if (Number.isFinite(n) && n > highest) highest = n;
  }
  return highest;
}

/**
 * Builds the next id for a table, for the current year.
 *
 * @param {object} prisma  the client
 * @param {string} model   a key of PREFIXES, e.g. 'user'
 * @param {number} [year]  defaults to the current year
 * @returns {Promise<string|null>} the id, or null for a model with no prefix
 */
async function nextId(prisma, model, year = new Date().getFullYear()) {
  if (!prefixFor(model) || !prisma[model]) return null;
  const n = await highestNumber(prisma, model, year) + 1;
  return `${prefixFor(model)}-${year}-${String(n).padStart(MIN_DIGITS, '0')}`;
}

/**
 * The highest number this process has handed out per table, which the database
 * cannot always be asked for.
 *
 * Two cases need it. Inside a transaction, rows created a moment ago are not
 * visible to the lookup — it runs on the unextended client, outside the
 * transaction — so counting would return the same number twice. And when a
 * write is rejected because its id was taken, the retry has to come back with
 * a different one rather than the same guess.
 *
 * Numbers are therefore never reused within a process. A rolled-back write
 * leaves a gap, which is what gaps in ids are for.
 */
const issued = new Map();

/**
 * Hands out ids for one write, which may create several rows at once.
 *
 * A single create can carry nested rows — a lead and its first log entry, a
 * channel partner and three — and none of them are committed while the ids are
 * being chosen, so the table is counted once and then tracked in memory.
 *
 * @param {object} prisma  a client that does NOT re-enter this extension
 * @returns {(model: string) => Promise<string|null>}
 */
function createAllocator(prisma, year = new Date().getFullYear()) {
  const counted = new Set();

  return async function allocate(model) {
    if (!prefixFor(model) || !prisma[model]) return null;

    const key = `${model}:${year}`;
    if (!counted.has(key)) {
      counted.add(key);
      const stored = await highestNumber(prisma, model, year);
      // Whichever is further along: what is committed, or what this process
      // has already promised to rows that are still in flight.
      if (stored > (issued.get(key) || 0)) issued.set(key, stored);
    }

    const n = (issued.get(key) || 0) + 1;
    issued.set(key, n);

    return `${prefixFor(model)}-${year}-${String(n).padStart(MIN_DIGITS, '0')}`;
  };
}

/** True when a string is one of these ids. */
function isRecordId(value) {
  return PATTERN.test(String(value || ''));
}

module.exports = {
  PREFIXES, MIRROR_FIELDS, prefixFor, mirrorFor,
  nextId, createAllocator, isRecordId, PATTERN, MIN_DIGITS,
};
