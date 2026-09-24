/**
 * Is the project round-robin actually going to assign anyone?
 *
 * Queues find their project by name, so a renamed project leaves its queue
 * pointing at a name nothing has. Nothing errors — new leads just quietly stay
 * with whoever entered them. This reports that, and can repair it.
 *
 *   node scripts/checkRrqHealth.js           report only
 *   node scripts/checkRrqHealth.js --fix     also repoint obvious orphans
 *
 * --fix only acts where the intent is unambiguous: exactly one project whose
 * name starts with, or is started by, the orphan's name. Anything less obvious
 * is listed for a person to decide.
 */

const prisma = require('../prismaClient');
const { PRESALES_RRQ_TYPE } = require('../utils/rrqTypes');

const FIX = process.argv.includes('--fix');

/** The single sensible destination for an orphan, or null if it is a guess. */
function bestMatch(orphanName, projectNames) {
  const needle = String(orphanName).trim().toLowerCase();
  const candidates = projectNames.filter((n) => {
    const hay = n.trim().toLowerCase();
    return hay.startsWith(needle) || needle.startsWith(hay);
  });
  return candidates.length === 1 ? candidates[0] : null;
}

async function main() {
  const [rrqs, projects] = await Promise.all([
    prisma.rRQ.findMany({ orderBy: { projectName: 'asc' } }),
    prisma.project.findMany({ select: { projectName: true }, orderBy: { projectName: 'asc' } }),
  ]);

  const projectNames = projects.map((p) => p.projectName);
  const names = new Set(projectNames);
  const queued = new Set(rrqs.map((r) => r.projectName));

  console.log(`\nRound-robin health\n${'='.repeat(60)}`);
  console.log(`${projects.length} project(s), ${rrqs.length} queue(s)\n`);

  const orphaned = rrqs.filter((r) => !names.has(r.projectName));
  const working = rrqs.filter((r) => names.has(r.projectName));

  if (working.length) {
    console.log('Working queues:');
    for (const r of working) {
      console.log(`  OK    "${r.projectName}" (${r.rrqType}) — ${r.assignedUsers.length} user(s)`);
    }
    console.log('');
  }

  if (orphaned.length) {
    console.log('BROKEN — these point at a project that does not exist.');
    console.log('Leads for them stay with whoever created them:\n');
    for (const r of orphaned) {
      const match = bestMatch(r.projectName, projectNames);
      console.log(`  BROKEN  "${r.projectName}" (${r.rrqType}, ${r.rrqId})`);
      console.log(`          ${match ? `looks like: "${match}"` : 'no obvious match — fix by hand'}`);

      if (FIX && match) {
        // eslint-disable-next-line no-await-in-loop
        await prisma.rRQ.update({ where: { id: r.id }, data: { projectName: match } });
        console.log(`          FIXED → now points at "${match}"`);
      }
    }
    console.log('');
  } else {
    console.log('No orphaned queues.\n');
  }

  const unqueued = projectNames.filter((n) => !queued.has(n));
  if (unqueued.length) {
    console.log('Projects with no Presales queue (leads stay with their creator):');
    unqueued.forEach((n) => console.log(`  -  "${n}"`));
    console.log('');
  }

  /* The rota itself: a seat naming a user who no longer resolves is skipped,
     which shortens the rotation without saying so. */
  for (const r of rrqs.filter((q) => names.has(q.projectName))) {
    for (const seat of r.assignedUsers) {
      // eslint-disable-next-line no-await-in-loop
      const user = await prisma.user.findFirst({
        where: { OR: [{ id: String(seat) }, { username: String(seat) }] },
      }).catch(() => null);
      if (!user) {
        console.log(`  WARN  "${r.projectName}" rota seat "${seat}" matches no user — it is skipped.`);
      } else if (user.archivedAt) {
        console.log(`  WARN  "${r.projectName}" rota seat "${user.username}" is archived.`);
      }
    }
  }

  if (orphaned.length && !FIX) {
    console.log('Re-run with --fix to repoint the ones with an obvious match.');
  }

  console.log(`\nDefault queue type for new leads: ${PRESALES_RRQ_TYPE}`);
  process.exit(orphaned.length && !FIX ? 1 : 0);
}

main().catch((error) => {
  console.error('Health check failed:', error.message);
  process.exit(1);
});
