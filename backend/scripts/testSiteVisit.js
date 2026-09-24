/**
 * Scenario tests for the site visit lifecycle and its notifications.
 *
 * Real modules, real database — the things worth testing here are the unique
 * index that stops a duplicate email and the reminder windows, and both of
 * those are database behaviour a mock would hide.
 *
 *   node scripts/testSiteVisit.js
 */

const prisma = require('../prismaClient');
const {
  scheduleVisit, transitionVisit, checkIn, checkOut,
  STATUSES, isTerminal, gatherVisitDetails, createFollowUpTask,
} = require('../utils/siteVisit');
const { notifyCustomer, customerFields, announce } = require('../utils/siteVisitNotify');
const { runReminderSweep } = require('../utils/siteVisitReminders');

const TAG = `SVTEST${Date.now().toString(36)}`;
const results = [];
let failures = 0;

function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  if (!passed) failures += 1;
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const hoursFromNow = (h) => new Date(Date.now() + h * 3600 * 1000);

async function main() {
  console.log(`\nSite visit scenarios  (tag ${TAG})\n${'='.repeat(64)}`);

  const owner = await prisma.user.create({
    data: { username: `${TAG}_own`, firstName: 'Owner', password: 'x', status: 'Manager', email: `${TAG}o@test.local` },
  });
  const admin = await prisma.user.create({
    data: { username: `${TAG}_adm`, firstName: 'Admin', password: 'x', status: 'Admin', email: `${TAG}a@test.local` },
  });
  const project = await prisma.project.create({
    data: {
      projectName: `${TAG} Project`,
      projectLocation: '12 Example Road, Chennai',
      mapLink: 'https://maps.example.com/x',
      projectContact: '+91 90000 00000',
      projectEmail: `${TAG}p@test.local`,
    },
  });

  const makeLead = () => prisma.lead.create({
    data: {
      name: `${TAG} Customer`,
      mobile: `9${Date.now().toString().slice(-9)}`,
      email: `${TAG}c@test.local`,
      project: project.id,
      status: 'Site Visit',
      owner: owner.id,
      ownerId: owner.id,
    },
  });

  const leadIds = [];
  try {
    /* ---- 1. schedule ---------------------------------------------------- */
    console.log('\n1. Scheduling saves first and gathers existing details');
    const lead1 = await makeLead(); leadIds.push(lead1.id);
    const { visit: v1 } = await scheduleVisit({
      leadId: lead1.id,
      scheduledAt: hoursFromNow(48),
      note: 'INTERNAL: budget approx 90L, chase finance',
      customerNote: 'Please bring a photo ID.',
      createdBy: owner.username,
    });
    check('visit saved', !!v1?.id);
    check('project pulled from the project record', v1.projectName === project.projectName,
      v1.projectName);
    check('project address carried over', v1.projectAddress === '12 Example Road, Chennai');
    check('customer contact carried over', v1.customerEmail === `${TAG}c@test.local` && !!v1.customerPhone);
    check('assigned user carried over', v1.assignedToId === owner.id, v1.assignedToName);
    check('starts Scheduled', v1.status === 'Scheduled');

    const leadAfter = await prisma.lead.findUnique({ where: { id: lead1.id } });
    check('existing lead columns still written', !!leadAfter.siteVisitDate && leadAfter.siteVisitStatus === 'Scheduled',
      `${leadAfter.siteVisitStatus}`);
    const tl = await prisma.leadLog.findFirst({ where: { leadId: lead1.id, title: 'Site visit scheduled' } });
    check('timeline entry written', !!tl, tl?.subtitle?.slice(0, 50));
    const act = await prisma.activity.findFirst({ where: { entityId: lead1.id, type: 'Site Visit' } });
    check('activity feed entry written', !!act);

    /* ---- 2. customer email is customer-safe ----------------------------- */
    console.log('\n2. The customer email cannot see internal data');
    const f = customerFields(v1);
    const blob = JSON.stringify(f);
    check('no lead id', !blob.includes(lead1.id), lead1.id);
    check('no internal note', !blob.includes('INTERNAL'));
    check('no owner email', !blob.includes(owner.email));
    check('no visit id', !blob.includes(v1.id));
    check('no status machine', !blob.includes('Scheduled'));
    check('customer note IS included', blob.includes('photo ID'));
    check('project address IS included', blob.includes('Example Road'));
    check('host first name IS included', blob.includes(owner.username) || blob.includes('Owner'));

    /* ---- 3. duplicate suppression --------------------------------------- */
    console.log('\n3. The same message cannot be sent twice');
    await notifyCustomer(v1, 'scheduled');
    const first = await prisma.siteVisitNotification.count({
      where: { siteVisitId: v1.id, audience: 'customer', event: 'scheduled' },
    });
    await notifyCustomer(v1, 'scheduled');
    await notifyCustomer(v1, 'scheduled');
    const after = await prisma.siteVisitNotification.count({
      where: { siteVisitId: v1.id, audience: 'customer', event: 'scheduled' },
    });
    check('one customer row after three attempts', first === 1 && after === 1, `${first} then ${after}`);

    /* ---- 4. internal fan-out, and no customer push ---------------------- */
    console.log('\n4. Internal gets push; the customer never does');
    const details = await gatherVisitDetails(lead1.id);
    await announce(v1, 'confirmed', details);
    const rows = await prisma.siteVisitNotification.findMany({ where: { siteVisitId: v1.id } });
    const customerPush = rows.filter((r) => r.audience === 'customer' && r.channel === 'push');
    check('ZERO customer push rows', customerPush.length === 0, `${customerPush.length}`);
    const internalPush = rows.filter((r) => r.audience === 'internal' && r.channel === 'push');
    check('internal push attempted', internalPush.length > 0, `${internalPush.length} rows`);
    const toAdmin = rows.filter((r) => r.recipientId === admin.id);
    check('admin is notified', toAdmin.length > 0, `${toAdmin.length} rows`);
    const toOwner = rows.filter((r) => r.recipientId === owner.id);
    check('assigned user is notified', toOwner.length > 0, `${toOwner.length} rows`);

    /* ---- 5. reschedule --------------------------------------------------- */
    console.log('\n5. Reschedule keeps the old time and re-arms reminders');
    const newTime = hoursFromNow(72);
    const v1b = await transitionVisit(v1.id, { status: 'Rescheduled', scheduledAt: newTime, actor: owner.username });
    check('time moved', new Date(v1b.scheduledAt).getTime() === newTime.getTime());
    check('previous time kept for the message', !!v1b.previousAt);
    check('reminders still armed', v1b.remindersOff === false);

    /* ---- 6. cancel stops reminders --------------------------------------- */
    console.log('\n6. Cancelling stops the reminders');
    const lead2 = await makeLead(); leadIds.push(lead2.id);
    const { visit: v2 } = await scheduleVisit({ leadId: lead2.id, scheduledAt: hoursFromNow(24.05), createdBy: owner.username });
    const v2c = await transitionVisit(v2.id, { status: 'Cancelled', cancelReason: 'Customer unavailable', actor: owner.username });
    check('status Cancelled', v2c.status === 'Cancelled');
    check('remindersOff set in the same write', v2c.remindersOff === true);
    const sweepAfterCancel = await runReminderSweep();
    const v2Rows = await prisma.siteVisitNotification.count({
      where: { siteVisitId: v2.id, event: { startsWith: 'reminder' } },
    });
    check('no reminder sent for a cancelled visit', v2Rows === 0,
      `${v2Rows} rows · swept ${sweepAfterCancel.checked}`);

    /* ---- 7. reminder windows --------------------------------------------- */
    console.log('\n7. Reminders fire in their window, once');
    const lead3 = await makeLead(); leadIds.push(lead3.id);
    // Just inside the 2-hour window and still in the future.
    const { visit: v3 } = await scheduleVisit({ leadId: lead3.id, scheduledAt: hoursFromNow(1.8), createdBy: owner.username });
    await runReminderSweep();
    const r1 = await prisma.siteVisitNotification.count({
      where: { siteVisitId: v3.id, event: 'reminder-2h' },
    });
    check('2-hour reminder sent', r1 > 0, `${r1} rows`);
    // Running the sweep repeatedly must not send it again.
    await runReminderSweep();
    await runReminderSweep();
    const r2 = await prisma.siteVisitNotification.count({
      where: { siteVisitId: v3.id, event: 'reminder-2h' },
    });
    check('repeated sweeps send nothing more', r2 === r1, `${r1} then ${r2}`);

    /* ---- 8. a past visit gets no reminder -------------------------------- */
    console.log('\n8. A visit already in the past is not reminded about');
    const lead4 = await makeLead(); leadIds.push(lead4.id);
    const { visit: v4 } = await scheduleVisit({ leadId: lead4.id, scheduledAt: hoursFromNow(1), createdBy: owner.username });
    await prisma.siteVisit.update({ where: { id: v4.id }, data: { scheduledAt: hoursFromNow(-1) } });
    await runReminderSweep();
    const r4 = await prisma.siteVisitNotification.count({
      where: { siteVisitId: v4.id, event: { startsWith: 'reminder' } },
    });
    check('no reminder for a visit in the past', r4 === 0, `${r4} rows`);

    /* ---- 9. check-in / check-out / outcome / follow-up ------------------- */
    console.log('\n9. Check-in, check-out, outcome and follow-up');
    const lead5 = await makeLead(); leadIds.push(lead5.id);
    const { visit: v5 } = await scheduleVisit({ leadId: lead5.id, scheduledAt: hoursFromNow(3), createdBy: owner.username });
    const inv = await checkIn(v5.id, { actor: owner.username });
    check('check-in recorded', !!inv.checkInAt && inv.status === 'In Progress');
    const outv = await checkOut(v5.id, {
      actor: owner.username, outcome: 'Interested', outcomeNote: 'Liked the 3BHK',
    });
    check('check-out recorded', !!outv.checkOutAt);
    check('status Completed', outv.status === 'Completed');
    check('outcome stored', outv.outcome === 'Interested');
    check('reminders stopped on completion', outv.remindersOff === true);
    const lead5after = await prisma.lead.findUnique({ where: { id: lead5.id } });
    check('lead columns mirrored', lead5after.siteVisitStatus === 'Completed' && !!lead5after.siteVisitDoneDate);
    const task = await createFollowUpTask(outv, { title: `${TAG} follow up`, dueDate: hoursFromNow(48), createdBy: owner.username });
    check('follow-up uses the existing Task table', !!task?.id && task.entityType === 'lead');

    /* ---- 10. no show ------------------------------------------------------ */
    console.log('\n10. No Show ends the visit too');
    const lead6 = await makeLead(); leadIds.push(lead6.id);
    const { visit: v6 } = await scheduleVisit({ leadId: lead6.id, scheduledAt: hoursFromNow(2), createdBy: owner.username });
    const v6n = await transitionVisit(v6.id, { status: 'No Show', actor: owner.username });
    check('status No Show', v6n.status === 'No Show');
    check('reminders stopped', v6n.remindersOff === true);

    /* ---- 11. statuses & validation --------------------------------------- */
    console.log('\n11. Statuses and validation');
    check('all seven statuses supported', STATUSES.length === 7, STATUSES.join(', '));
    ['Completed', 'Cancelled', 'No Show'].forEach((s) => check(`${s} is terminal`, isTerminal(s)));
    ['Scheduled', 'Confirmed', 'Rescheduled', 'In Progress'].forEach((s) => check(`${s} is not terminal`, !isTerminal(s)));
    let rejected = false;
    try { await transitionVisit(v6.id, { status: 'Banana' }); } catch { rejected = true; }
    check('an unknown status is rejected', rejected);
    let badDate = false;
    try { await scheduleVisit({ leadId: lead6.id, scheduledAt: 'not a date' }); } catch { badDate = true; }
    check('an invalid date is rejected', badDate);

    /* ---- 12. missing customer / project data ----------------------------- */
    console.log('\n12. Missing data does not break scheduling');
    const bare = await prisma.lead.create({
      data: { name: `${TAG} Bare`, mobile: `7${Date.now().toString().slice(-9)}`, owner: owner.id, ownerId: owner.id },
    });
    leadIds.push(bare.id);
    const { visit: v7 } = await scheduleVisit({ leadId: bare.id, scheduledAt: hoursFromNow(30), createdBy: owner.username });
    check('schedules with no project and no email', !!v7?.id);
    const cust = await notifyCustomer(v7, 'scheduled');
    check('customer email skipped, not crashed', !!cust.skipped, cust.skipped);
  } finally {
    console.log('\nCleaning up…');
    const visitIds = (await prisma.siteVisit.findMany({
      where: { leadId: { in: leadIds } }, select: { id: true },
    })).map((v) => v.id);
    await prisma.siteVisitNotification.deleteMany({ where: { siteVisitId: { in: visitIds } } }).catch(() => { });
    await prisma.siteVisit.deleteMany({ where: { leadId: { in: leadIds } } }).catch(() => { });
    await prisma.task.deleteMany({ where: { entityId: { in: leadIds } } }).catch(() => { });
    await prisma.activity.deleteMany({ where: { entityId: { in: leadIds } } }).catch(() => { });
    await prisma.leadLog.deleteMany({ where: { leadId: { in: leadIds } } }).catch(() => { });
    await prisma.leadAssignment.deleteMany({ where: { leadId: { in: leadIds } } }).catch(() => { });
    await prisma.stageHistory.deleteMany({ where: { entityId: { in: leadIds } } }).catch(() => { });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } }).catch(() => { });
    await prisma.project.deleteMany({ where: { projectName: { startsWith: TAG } } }).catch(() => { });
    await prisma.notification.deleteMany({ where: { userId: { in: [owner.id, admin.id] } } }).catch(() => { });
    await prisma.user.deleteMany({ where: { username: { startsWith: TAG } } }).catch(() => { });
  }

  console.log(`\n${'='.repeat(64)}`);
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
