/**
 * Fills the Designation, Branch and Location masters from what users already
 * have.
 *
 * These three were free text, so the values in use are the only record of what
 * the lists should contain. Seeding from them means nobody loses the value on
 * their own record the moment the field becomes a dropdown — which is exactly
 * how a master migration usually goes wrong.
 *
 * Safe to run more than once: each name is created only if absent.
 *
 *   node scripts/seedStaffMasters.js
 */

const prisma = require('../prismaClient');

const LISTS = [
  { model: 'designation', field: 'designation', label: 'Designation' },
  { model: 'branch', field: 'branch', label: 'Branch' },
  { model: 'location', field: 'location', label: 'Location' },
];

async function main() {
  console.log(`\nSeeding staff masters from existing user records\n${'='.repeat(56)}`);

  for (const list of LISTS) {
    const users = await prisma.user.findMany({
      where: { [list.field]: { not: null } },
      select: { [list.field]: true },
    });

    // Trimmed, de-duplicated case-insensitively — the first spelling wins.
    const seen = new Map();
    for (const u of users) {
      const value = String(u[list.field] ?? '').trim();
      if (!value) continue;
      if (!seen.has(value.toLowerCase())) seen.set(value.toLowerCase(), value);
    }

    const existing = await prisma[list.model].findMany({ select: { name: true } });
    const have = new Set(existing.map((e) => e.name.toLowerCase()));

    let added = 0;
    for (const name of seen.values()) {
      if (have.has(name.toLowerCase())) continue;
      // eslint-disable-next-line no-await-in-loop
      await prisma[list.model].create({ data: { name } }).catch(() => { });
      added += 1;
    }

    const total = await prisma[list.model].count();
    console.log(`  ${list.label.padEnd(12)} found ${seen.size} in use, added ${added}, list now ${total}`);
    if (seen.size) console.log(`               ${[...seen.values()].join(', ')}`);
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch((error) => {
  console.error('Seeding failed:', error.message);
  process.exit(1);
});
