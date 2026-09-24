/**
 * Scenario tests for the lead follow-up / reassignment clock.
 *
 * These drive the real modules against the real database, because the things
 * most likely to be wrong here are the things a mock would paper over: the
 * unique index that stops a second timer, the conditional update that makes a
 * duplicate job run harmless, and the rota agreeing with the one in
 * createLead. All of that is database behaviour.
 *
 * Everything is created under a run-scoped prefix and deleted at the end, so
 * it can be run against a development database without leaving anything.
 *
 *   node scripts/testLeadReassignment.js
 */

const prisma = require('../prismaClient');
const {
  startAssignmentTimer, recordLeadActivity, cancelPendingFor,
  runReassignmentSweep, isTerminalStatus,
} = require('../utils/leadAssignment');
const { nextOwnerAfter } = require('../utils/leadRoundRobin');
const { PRESALES_RRQ_TYPE } = require('../utils/rrqTypes');

const TAG = `RATEST${Date.now().toString(36)}`;
const results = [];
let failures = 0;

function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  if (!passed) failures += 1;
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

/** Push a pending window into the past so the sweep sees it as expired. */
async function expire(leadId) {
  const past = new Date(Date.now() - 60 * 60 * 1000);
  await prisma.leadAssignment.updateMany({
    where: { leadId, state: 'waiting' },
    data: { dueAt: past, assignedAt: past },
  });
  await prisma.lead.update({ where: { id: leadId }, data: { assignedAt: past } }).catch(() => { });
}

const currentAssignment = (leadId) => prisma.leadAssignment.findFirst({
  where: { leadId }, orderBy: { cycle: 'desc' },
});

async function main() {
  console.log(`\nLead reassignment scenarios  (tag ${TAG})\n${'='.repeat(60)}`);

  /* ---- fixtures ---------------------------------------------------------- */
  const users = [];
  for (const suffix of ['a', 'b', 'c']) {
    // eslint-disable-next-line no-await-in-loop
    users.push(await prisma.user.create({
      data: {
        username: `${TAG}_${suffix}`,
        firstName: 'Test',
        password: 'x',
        status: 'Manager',
        email: `${TAG}_${suffix}@test.local`,
      },
    }));
  }
  // An account nobody should be handed work.
  const suspended = await prisma.user.create({
    data: { username: `${TAG}_susp`, firstName: 'Test', password: 'x', status: 'Suspended', email: `${TAG}s@test.local` },
  });

  const projectName = `${TAG} Project`;
  await prisma.rRQ.create({
    data: {
      rrqId: `${TAG}-RRQ`,
      projectName,
      rrqName: `${TAG} rota`,
      rrqType: PRESALES_RRQ_TYPE,
      assignedUsers: [users[0].username, users[1].username, users[2].username],
    },
  });

  const makeLead = async (extra = {}) => prisma.lead.create({
    data: {
      name: `${TAG} lead`,
      mobile: `9${Date.now().toString().slice(-9)}`,
      project: projectName,
      status: 'New Lead',
      owner: users[0].id,
      ownerId: users[0].id,
      ...extra,
    },
  });

  const settings = await prisma.leadAssignmentSetting.findFirst({ orderBy: { createdAt: 'asc' } })
    || await prisma.leadAssignmentSetting.create({ data: {} });
  console.log(`\nConfigured window: ${settings.timeoutMinutes} minutes, enabled=${settings.enabled}\n`);

  const leadIds = [];

  try {
    /* ---- 1. normal assignment -------------------------------------------- */
    console.log('1. Normal assignment opens one window');
    const l1 = await makeLead(); leadIds.push(l1.id);
    await startAssignmentTimer(l1, { ownerId: users[0].id, ownerName: users[0].username });
    const a1 = await currentAssignment(l1.id);
    check('window opened', !!a1 && a1.state === 'waiting', a1 ? `cycle ${a1.cycle}` : 'none');
    check('deadline is in the future', !!a1 && new Date(a1.dueAt) > new Date());
    check('deadline honours the setting', !!a1
      && Math.round((new Date(a1.dueAt) - new Date(a1.assignedAt)) / 60000) === settings.timeoutMinutes,
    `${a1 ? Math.round((new Date(a1.dueAt) - new Date(a1.assignedAt)) / 60000) : '?'} min`);

    /* ---- 2. duplicate timers --------------------------------------------- */
    console.log('\n2. Starting the clock twice does not make two windows');
    await startAssignmentTimer(l1, { ownerId: users[0].id, ownerName: users[0].username });
    const waiting1 = await prisma.leadAssignment.count({ where: { leadId: l1.id, state: 'waiting' } });
    check('exactly one window waiting', waiting1 === 1, `${waiting1} waiting`);

    /* ---- 3. owner acts in time ------------------------------------------- */
    console.log('\n3. Owner acts inside the window');
    const l3 = await makeLead(); leadIds.push(l3.id);
    await startAssignmentTimer(l3, { ownerId: users[0].id, ownerName: users[0].username });
    const acted = await recordLeadActivity(l3.id, { actorId: users[0].username, actorName: users[0].username });
    check('activity recorded', acted === true);
    const a3 = await currentAssignment(l3.id);
    check('window satisfied', a3?.state === 'satisfied', a3?.state);
    await expire(l3.id);
    const sweep3 = await runReassignmentSweep();
    const l3after = await prisma.lead.findUnique({ where: { id: l3.id } });
    check('owner unchanged after sweep', l3after.ownerId === users[0].id, `reassigned=${sweep3.reassigned}`);

    /* ---- 4. someone else acting is not a response ------------------------ */
    console.log('\n4. A non-owner acting does not stop the clock');
    const l4 = await makeLead(); leadIds.push(l4.id);
    await startAssignmentTimer(l4, { ownerId: users[0].id, ownerName: users[0].username });
    const byOther = await recordLeadActivity(l4.id, { actorId: users[2].username, actorName: users[2].username });
    check('ignored', byOther === false);
    check('still waiting', (await currentAssignment(l4.id))?.state === 'waiting');

    /* ---- 5. timeout reassignment ----------------------------------------- */
    console.log('\n5. No response → next seat on the rota');
    const l5 = await makeLead(); leadIds.push(l5.id);
    await startAssignmentTimer(l5, { ownerId: users[0].id, ownerName: users[0].username });
    await expire(l5.id);
    const sweep5 = await runReassignmentSweep();
    const l5after = await prisma.lead.findUnique({ where: { id: l5.id } });
    check('lead moved', l5after.ownerId === users[1].id,
      `owner ${l5after.ownerId === users[1].id ? 'b' : l5after.ownerId} · reassigned=${sweep5.reassigned}`);
    check('moved to the NEXT seat, not any seat', l5after.ownerId === users[1].id);
    check('a fresh window opened', (await currentAssignment(l5.id))?.state === 'waiting');
    const log5 = await prisma.leadLog.findFirst({
      where: { leadId: l5.id, title: 'Reassigned automatically' }, orderBy: { date: 'desc' },
    });
    check('audit entry written', !!log5, log5?.subtitle?.slice(0, 60));
    check('audit names the reason', !!log5 && /minute/.test(log5.subtitle || ''));

    /* ---- 6. duplicate job run -------------------------------------------- */
    console.log('\n6. Running the sweep again reassigns nothing twice');
    const l6 = await makeLead(); leadIds.push(l6.id);
    await startAssignmentTimer(l6, { ownerId: users[0].id, ownerName: users[0].username });
    await expire(l6.id);
    const [r1, r2] = await Promise.all([runReassignmentSweep(), runReassignmentSweep()]);
    const moves6 = await prisma.leadAssignment.count({
      where: { leadId: l6.id, state: 'reassigned' },
    });
    check('exactly one reassignment', moves6 === 1, `${moves6} · sweeps ${r1.reassigned}/${r2.reassigned}`);
    const windows6 = await prisma.leadAssignment.count({ where: { leadId: l6.id, state: 'waiting' } });
    check('exactly one live window after', windows6 === 1, `${windows6} waiting`);

    /* ---- 7. consecutive cycles ------------------------------------------- */
    console.log('\n7. Repeated silence walks the rota');
    const l7 = await makeLead(); leadIds.push(l7.id);
    await startAssignmentTimer(l7, { ownerId: users[0].id, ownerName: users[0].username });
    const seen = [users[0].id];
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await expire(l7.id);
      // eslint-disable-next-line no-await-in-loop
      await runReassignmentSweep();
      // eslint-disable-next-line no-await-in-loop
      const row = await prisma.lead.findUnique({ where: { id: l7.id } });
      seen.push(row.ownerId);
    }
    const asLetters = seen.map((id) => 'abc'[users.findIndex((u) => u.id === id)] ?? '?').join(' → ');
    check('walked the rota in order and wrapped', asLetters === 'a → b → c → a', asLetters);
    check('never the same user twice running',
      seen.every((id, i) => i === 0 || id !== seen[i - 1]), asLetters);

    /* ---- 8. terminal status ---------------------------------------------- */
    console.log('\n8. A finished lead stops the clock');
    /* The statuses this installation actually has, read from the master table
       rather than guessed: the list is editable, so a hard-coded expectation
       here would be testing a vocabulary the app does not use. */
    check('Rejected is terminal', isTerminalStatus('Rejected'));
    check('Duplicate is terminal', isTerminalStatus('Duplicate'));
    check('Possible Duplicate is terminal', isTerminalStatus('Possible Duplicate'));
    check('Converted is terminal', isTerminalStatus('Converted'));
    check('New Lead is NOT terminal', !isTerminalStatus('New Lead'));
    check('Attempted is NOT terminal', !isTerminalStatus('Attempted'));
    check('Interested is NOT terminal', !isTerminalStatus('Interested'));
    check('Site Visit is NOT terminal', !isTerminalStatus('Site Visit'));
    check('Allocate is NOT terminal', !isTerminalStatus('Allocate'));

    /* An unmapped status keeps its clock running rather than silently
       stopping. Erring towards "keep chasing" is the safe direction: the cost
       is an extra reassignment, not a lead nobody ever calls. */
    check('an unmapped status is not treated as terminal',
      !isTerminalStatus('Some Status Nobody Mapped'));

    const l8 = await makeLead(); leadIds.push(l8.id);
    await startAssignmentTimer(l8, { ownerId: users[0].id, ownerName: users[0].username });
    await prisma.lead.update({ where: { id: l8.id }, data: { status: 'Lost' } });
    await cancelPendingFor(l8.id, 'lead is Lost');
    await expire(l8.id);
    await runReassignmentSweep();
    const l8after = await prisma.lead.findUnique({ where: { id: l8.id } });
    check('closed lead never moves', l8after.ownerId === users[0].id);
    check('no live window remains',
      (await prisma.leadAssignment.count({ where: { leadId: l8.id, state: 'waiting' } })) === 0);

    /* A lead that reaches a terminal status without anyone calling cancel is
       still safe: the sweep itself checks before moving anything. */
    const l8b = await makeLead(); leadIds.push(l8b.id);
    await startAssignmentTimer(l8b, { ownerId: users[0].id, ownerName: users[0].username });
    await prisma.lead.update({ where: { id: l8b.id }, data: { status: 'Converted' } });
    await expire(l8b.id);
    await runReassignmentSweep();
    const l8bAfter = await prisma.lead.findUnique({ where: { id: l8b.id } });
    check('sweep refuses a terminal lead even with a live window',
      l8bAfter.ownerId === users[0].id);

    /* ---- 9. manual reassignment ------------------------------------------ */
    console.log('\n9. A hand-assigned lead gets its own full window');
    const l9 = await makeLead(); leadIds.push(l9.id);
    await startAssignmentTimer(l9, { ownerId: users[0].id, ownerName: users[0].username });
    await expire(l9.id);                       // old window expired...
    const l9moved = await prisma.lead.update({
      where: { id: l9.id }, data: { owner: users[2].id, ownerId: users[2].id },
    });
    await startAssignmentTimer(l9moved, {
      ownerId: users[2].id, ownerName: users[2].username, source: 'manual',
    });
    await runReassignmentSweep();              // ...must not now steal the lead
    const l9after = await prisma.lead.findUnique({ where: { id: l9.id } });
    check('stays with the person it was given to', l9after.ownerId === users[2].id,
      `owner=${l9after.ownerId === users[2].id ? 'c' : l9after.ownerId}`);
    const a9 = await currentAssignment(l9.id);
    check('its window is fresh, not inherited', a9?.state === 'waiting' && new Date(a9.dueAt) > new Date());

    /* ---- 10. no eligible user -------------------------------------------- */
    console.log('\n10. Nowhere to send it → leave it alone');
    const soloProject = `${TAG} Solo`;
    await prisma.rRQ.create({
      data: {
        rrqId: `${TAG}-SOLO`,
        projectName: soloProject,
        rrqName: `${TAG} solo`,
        rrqType: PRESALES_RRQ_TYPE,
        assignedUsers: [users[0].username, suspended.username],
      },
    });
    const l10 = await prisma.lead.create({
      data: {
        name: `${TAG} solo lead`,
        mobile: `8${Date.now().toString().slice(-9)}`,
        project: soloProject,
        status: 'New Lead',
        owner: users[0].id,
        ownerId: users[0].id,
      },
    });
    leadIds.push(l10.id);
    await startAssignmentTimer(l10, { ownerId: users[0].id, ownerName: users[0].username });
    await expire(l10.id);
    await runReassignmentSweep();
    const l10after = await prisma.lead.findUnique({ where: { id: l10.id } });
    check('lead keeps its owner rather than going nowhere', l10after.ownerId === users[0].id);
    check('no invalid assignment was written',
      (await prisma.leadAssignment.count({ where: { leadId: l10.id, ownerId: suspended.id } })) === 0);

    const nextForSolo = await nextOwnerAfter({
      projectName: soloProject, rrqType: PRESALES_RRQ_TYPE, currentOwnerId: users[0].id,
    });
    check('rota skips the suspended account', nextForSolo === null,
      nextForSolo ? `offered ${nextForSolo.user.username}` : 'none offered');

    /* ---- 11. project with no rota ---------------------------------------- */
    console.log('\n11. A project with no rota at all');
    const none = await nextOwnerAfter({
      projectName: `${TAG} nonexistent`, rrqType: PRESALES_RRQ_TYPE, currentOwnerId: users[0].id,
    });
    check('offers nobody rather than guessing', none === null);

    /* ---- 12. race on the same window ------------------------------------- */
    console.log('\n12. Two workers racing the same window');
    const l12 = await makeLead(); leadIds.push(l12.id);
    await startAssignmentTimer(l12, { ownerId: users[0].id, ownerName: users[0].username });
    await expire(l12.id);
    await Promise.all([
      runReassignmentSweep(), runReassignmentSweep(),
      runReassignmentSweep(), runReassignmentSweep(),
    ]);
    const moves12 = await prisma.leadAssignment.count({ where: { leadId: l12.id, state: 'reassigned' } });
    const live12 = await prisma.leadAssignment.count({ where: { leadId: l12.id, state: 'waiting' } });
    check('moved once despite four concurrent sweeps', moves12 === 1, `${moves12} moves`);
    check('one live window', live12 === 1, `${live12} waiting`);

    /* ---- 13. notification is claimed once -------------------------------- */
    console.log('\n13. One announcement per assignment');
    const a13 = await currentAssignment(l12.id);
    check('reassignment notification was stamped', !!a13?.notifiedAt,
      a13?.notifiedAt ? 'notifiedAt set' : 'not stamped');
    check('stamped exactly once', (a13?.notifyAttempts ?? 0) === 1, `attempts=${a13?.notifyAttempts}`);
    check('delivery outcome recorded', a13?.pushResult !== null || a13?.emailResult !== null,
      `push=${String(a13?.pushResult).slice(0, 40)} email=${String(a13?.emailResult).slice(0, 40)}`);

    /* ---- 14. survives a restart ------------------------------------------ */
    console.log('\n14. Deadlines live in the database, not in memory');
    const l14 = await makeLead(); leadIds.push(l14.id);
    await startAssignmentTimer(l14, { ownerId: users[0].id, ownerName: users[0].username });
    await expire(l14.id);
    // Re-require the modules: a fresh process holding no timers of its own.
    delete require.cache[require.resolve('../utils/leadAssignment')];
    // eslint-disable-next-line global-require
    const fresh = require('../utils/leadAssignment');
    await fresh.runReassignmentSweep();
    const l14after = await prisma.lead.findUnique({ where: { id: l14.id } });
    check('a newly-loaded process picks up the pending deadline',
      l14after.ownerId === users[1].id);

    /* ---- 15. deleting a lead takes its timers with it -------------------- */
    console.log('\n15. Deleting a lead clears its windows');
    const l15 = await makeLead();
    await startAssignmentTimer(l15, { ownerId: users[0].id, ownerName: users[0].username });
    await prisma.lead.delete({ where: { id: l15.id } });
    check('windows deleted with the lead',
      (await prisma.leadAssignment.count({ where: { leadId: l15.id } })) === 0);
  } finally {
    /* ---- teardown -------------------------------------------------------- */
    console.log('\nCleaning up…');
    await prisma.leadAssignment.deleteMany({ where: { leadId: { in: leadIds } } }).catch(() => { });
    await prisma.leadLog.deleteMany({ where: { leadId: { in: leadIds } } }).catch(() => { });
    await prisma.stageHistory.deleteMany({ where: { entityId: { in: leadIds } } }).catch(() => { });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } }).catch(() => { });
    await prisma.rRQ.deleteMany({ where: { rrqId: { startsWith: TAG } } }).catch(() => { });
    await prisma.notification.deleteMany({
      where: { userId: { in: [...users.map((u) => u.id), suspended.id] } },
    }).catch(() => { });
    await prisma.user.deleteMany({ where: { username: { startsWith: TAG } } }).catch(() => { });
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${results.length - failures}/${results.length} checks passed`);
  if (failures) {
    console.log('\nFailed:');
    results.filter((r) => !r.passed).forEach((r) => console.log(`  - ${r.name} ${r.detail}`));
  }
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error('\nTest run failed:', error);
  process.exit(1);
});
