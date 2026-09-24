/**
 * Points the legacy id columns at the id itself.
 *
 *   node scripts/syncMirrorColumns.js           # show the plan
 *   node scripts/syncMirrorColumns.js --write   # apply it
 *
 * A handful of tables carry their key twice: `oppId` beside `id`, `cpId`,
 * `propertyId`, `templateId`. The screens read those columns, and they still
 * hold values in the formats this migration replaced — PROP_2267curl,
 * ET-2026-001 — so a record would show one id in the list and another in the
 * URL. They are NOT NULL and unique, so they are filled with the id rather
 * than dropped, which would mean touching every screen that reads them.
 */
const prisma = require('../prismaClient');
const { MIRROR_FIELDS } = require('../utils/refId');

const WRITE = process.argv.includes('--write');

(async () => {
  console.log(WRITE ? 'Syncing…\n' : 'Dry run — nothing is written. Pass --write to apply.\n');

  let total = 0;
  for (const [model, field] of Object.entries(MIRROR_FIELDS)) {
    if (!prisma[model]) continue;

    let rows;
    try {
      rows = await prisma[model].findMany({ select: { id: true, [field]: true } });
    } catch {
      console.log(`  ${model.padEnd(18)} skipped (no ${field} column)`);
      continue;
    }

    const stale = rows.filter((r) => r[field] !== r.id);
    total += stale.length;

    const sample = stale.slice(0, 2).map((r) => `${r[field]} -> ${r.id}`).join(',  ');
    console.log(`  ${model.padEnd(18)} ${String(rows.length).padStart(3)} rows, ${String(stale.length).padStart(3)} to change  ${sample}`);

    if (WRITE) {
      for (const row of stale) {
        await prisma[model].update({ where: { id: row.id }, data: { [field]: row.id } });
      }
    }
  }

  console.log(`\n  ${total} value(s) ${WRITE ? 'updated' : 'to update'}`);
  await prisma.$disconnect();
})().catch((err) => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
