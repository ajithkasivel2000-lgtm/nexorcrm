/**
 * Rewrites every primary key to PREFIX-YEAR-NUMBER, e.g. USR-2026-001.
 *
 *   node scripts/migrateIdFormat.js           # show the plan, change nothing
 *   node scripts/migrateIdFormat.js --write   # apply it
 *
 * Two kinds of reference have to survive this:
 *
 *   1. Real foreign keys — LeadLog.leadId, OpportunityLog.opportunityId,
 *      ChannelPartnerLog.channelPartnerId and both
 *      sides of _UserGroupMembers. Every one is ON UPDATE CASCADE, so the
 *      database rewrites them itself when the parent id changes.
 *
 *   2. Plain string columns that name a record without a constraint —
 *      Lead.ownerId, Opportunity.leadId, Lead.channelPartnerId and the rest.
 *      Nothing rewrites those, so this script does, using the same old -> new
 *      map it used for the ids.
 *
 * Ids are renumbered by creation date within each year, so they read as a
 * history rather than as the order the rows happened to come back.
 */
const prisma = require('../prismaClient');

const WRITE = process.argv.includes('--write');
const DIGITS = 3;

/** Three letters per table, distinct enough to tell apart at a glance. */
const PREFIX = {
  lead: 'LED',
  opportunity: 'OPP',
  customer: 'CUS',
  user: 'USR',
  userGroup: 'UGR',
  channelPartner: 'CHP',
  project: 'PRJ',
  Leads: 'ENQ',
  rRQ: 'RRQ',
  rRQType: 'RQT',
  emailTemplate: 'EMT',
  leadStatus: 'LST',
  leadType: 'LTP',
  projectStatus: 'PST',
  projectType: 'PTP',
  primarySource: 'PSR',
  secondarySource: 'SSR',
  tertiarySource: 'TSR',
  pageAccess: 'PGA',
  leadLog: 'LLG',
  opportunityLog: 'OLG',
  channelPartnerLog: 'CLG',
  systemLog: 'SLG',
  session: 'SES',
  mailSetting: 'MST',
  sessionSetting: 'SST',
  securitySetting: 'SCS',
  registrationSetting: 'RST',
  globalUserSetting: 'GUS',
};

/**
 * Columns that name a record but carry no foreign key, so nothing rewrites
 * them when the id they point at changes.
 *
 * `model` is where the column lives; `points` is the table it refers to.
 */
const LOOSE_REFERENCES = [
  { model: 'lead', field: 'ownerId', points: 'user' },
  { model: 'lead', field: 'owner', points: 'user' },
  { model: 'lead', field: 'allocator', points: 'user' },
  { model: 'lead', field: 'channelPartnerId', points: 'channelPartner' },
  { model: 'opportunity', field: 'leadId', points: 'lead' },
  { model: 'opportunity', field: 'opportunityOwner', points: 'user' },
  { model: 'opportunity', field: 'allocator', points: 'user' },
  { model: 'opportunity', field: 'reportingManager', points: 'user' },
  { model: 'opportunity', field: 'channelPartnerId', points: 'channelPartner' },
  { model: 'channelPartner', field: 'leadOwner', points: 'user' },
];

const pad = (n) => String(n).padStart(DIGITS, '0');

/** Builds old -> new for one table, numbering by creation date within a year. */
async function planFor(model, prefix) {
  if (!prisma[model]) return null;

  let rows;
  try {
    rows = await prisma[model].findMany({ select: { id: true, createdAt: true }, orderBy: { createdAt: 'asc' } });
  } catch {
    try {
      rows = await prisma[model].findMany({ select: { id: true } });
    } catch {
      return null;   // no id column, or not a table we can read
    }
  }
  if (rows.length === 0) return { model, prefix, map: new Map(), rows: 0 };

  const perYear = new Map();
  const map = new Map();

  for (const row of rows) {
    const year = (row.createdAt ? new Date(row.createdAt) : new Date()).getFullYear();
    const next = (perYear.get(year) || 0) + 1;
    perYear.set(year, next);
    const id = `${prefix}-${year}-${pad(next)}`;
    if (id !== row.id) map.set(row.id, id);
  }

  return { model, prefix, map, rows: rows.length };
}

(async () => {
  console.log(WRITE
    ? 'Rewriting primary keys…\n'
    : 'Dry run — nothing is written. Pass --write to apply.\n');

  /* ---- 1. work out every new id ---------------------------------------- */
  const plans = [];
  for (const [model, prefix] of Object.entries(PREFIX)) {
    const plan = await planFor(model, prefix);
    if (!plan) { console.log(`  ${model.padEnd(20)} skipped (no readable id)`); continue; }
    plans.push(plan);
    const sample = [...plan.map.entries()].slice(0, 2)
      .map(([from, to]) => `${from.slice(0, 16)} -> ${to}`).join(',  ');
    console.log(`  ${model.padEnd(20)} ${String(plan.rows).padStart(3)} rows, ${String(plan.map.size).padStart(3)} to change  ${sample}`);
  }

  const totalChanges = plans.reduce((a, p) => a + p.map.size, 0);
  console.log(`\n  ${totalChanges} primary key(s) to rewrite`);

  /* ---- 2. the loose references that will need rewriting ----------------- */
  console.log('\n  references with no foreign key, which this script rewrites by hand:');
  const refWork = [];
  for (const ref of LOOSE_REFERENCES) {
    if (!prisma[ref.model]) continue;
    const targetPlan = plans.find((p) => p.model === ref.points);
    if (!targetPlan || targetPlan.map.size === 0) continue;

    let hits = 0;
    for (const oldId of targetPlan.map.keys()) {
      try {
        hits += await prisma[ref.model].count({ where: { [ref.field]: oldId } });
      } catch { /* column not present */ }
    }
    if (hits > 0) {
      refWork.push({ ...ref, hits, map: targetPlan.map });
      console.log(`    ${(ref.model + '.' + ref.field).padEnd(36)} ${hits} row(s) point at ${ref.points}`);
    }
  }
  if (refWork.length === 0) console.log('    none');

  if (!WRITE) {
    console.log('\nNothing was changed. Re-run with --write to apply.');
    process.exit(0);
  }

  /* ---- 3. apply --------------------------------------------------------- */
  console.log('\nApplying…');
  for (const plan of plans) {
    if (plan.map.size === 0) continue;
    let done = 0;
    for (const [from, to] of plan.map) {
      // Foreign keys are ON UPDATE CASCADE, so the children follow this.
      await prisma[plan.model].update({ where: { id: from }, data: { id: to } });
      done += 1;
    }
    console.log(`  ${plan.model.padEnd(20)} ${done} id(s) rewritten`);
  }

  console.log('\nRewriting the references that do not cascade…');
  for (const ref of refWork) {
    let moved = 0;
    for (const [from, to] of ref.map) {
      const r = await prisma[ref.model].updateMany({
        where: { [ref.field]: from },
        data: { [ref.field]: to },
      });
      moved += r.count;
    }
    console.log(`  ${(ref.model + '.' + ref.field).padEnd(36)} ${moved} row(s)`);
  }

  console.log('\nDone. Run scripts/syncMirrorColumns.js next if any table has a legacy id column.');
  process.exit(0);
})().catch((err) => {
  console.error('\nFailed:', err.message);
  console.error('Nothing further was applied. The database is mid-migration if this happened during step 3.');
  process.exit(1);
});
