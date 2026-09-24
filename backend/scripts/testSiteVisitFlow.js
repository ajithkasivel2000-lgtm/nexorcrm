/**
 * The site visit flow as the existing screens actually drive it.
 *
 * testSiteVisit.js exercises the lifecycle directly. This one goes in through
 * the bridge with the exact payloads LeadProfile posts — 'Re Scheduled Visit',
 * 'Site Visit Confirmed', 'Site Visit Done' and the rest — because the thing
 * most likely to be wrong is the mapping between what the screen sends and
 * what the lifecycle expects.
 *
 *   node scripts/testSiteVisitFlow.js
 */

const prisma = require('../prismaClient');
const { syncSiteVisitFromLead } = require('../utils/siteVisitSync');
const { runReminderSweep } = require('../utils/siteVisitReminders');

const TAG = `SVFLOW${Date.now().toString(36)}`;
const results = [];
let failures = 0;

function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  if (!passed) failures += 1;
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const hoursFromNow = (h) => new Date(Date.now() + h * 3600 * 1000);

/** Save the lead the way the controller does, then run the bridge. */
async function saveLead(leadId, body, actor = 'tester') {
  const data = {};
  if (body.siteVisitStatus) data.siteVisitStatus = body.siteVisitStatus;
  if (body.siteVisitDate) data.siteVisitDate = new Date(body.siteVisitDate);
  if (body.siteVisitNote) data.siteVisitNote = body.siteVisitNote;
  if (body.status) data.status = body.status;
  const lead = await prisma.lead.update({ where: { id: leadId }, data });
  return syncSiteVisitFromLead(lead, { body, actor });
}

const liveVisit = (leadId) => prisma.siteVisit.findFirst({
  where: { leadId }, orderBy: { createdAt: 'desc' },
});

async function main() {
  console.log(`\nSite visit flow, through the existing screens  (tag ${TAG})\n${'='.repeat(66)}`);

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
    },
  });

  const makeLead = () => prisma.lead.create({
    data: {
      name: `${TAG} Customer`,
      mobile: `9${Date.now().toString().slice(-9)}`,
      email: `${TAG}c@test.local`,
      project: project.id,
      status: 'New Lead',
      owner: owner.id,
      ownerId: owner.id,
    },
  });

  const leadIds = [];
  try {
    /* ---- 1. schedule, exactly as the screen posts it -------------------- */
    console.log('\n1. Screen posts status "Site Visit" + a date');
    const lead = await makeLead(); leadIds.push(lead.id);
    const r1 = await saveLead(lead.id, { status: 'Site Visit', siteVisitDate: hoursFromNow(48), siteVisitNote: 'INTERNAL: bring the 3BHK brochure' });
    check('a visit record was created', !!r1?.visit, r1?.visit?.status);
    check('announced as "scheduled"', r1?.event === 'scheduled', r1?.event);
    const v1 = await liveVisit(lead.id);
    check('project details pulled in', v1.projectName === project.projectName && !!v1.projectAddress);
    check('customer contact pulled in', v1.customerEmail === `${TAG}c@test.local` && !!v1.customerPhone);
    check('assigned user pulled in', v1.assignedToId === owner.id, v1.assignedToName);

    const notes = await prisma.siteVisitNotification.findMany({ where: { siteVisitId: v1.id } });
    check('internal audience notified', notes.some((n) => n.audience === 'internal'), `${notes.length} rows`);
    check('admin included', notes.some((n) => n.recipientId === admin.id));
    check('owner included', notes.some((n) => n.recipientId === owner.id));
    check('customer emailed', notes.some((n) => n.audience === 'customer' && n.channel === 'email'));
    check('NO customer push', !notes.some((n) => n.audience === 'customer' && n.channel === 'push'));
    check('internal push attempted', notes.some((n) => n.audience === 'internal' && n.channel === 'push'));

    /* ---- 2. the old lead columns still work ----------------------------- */
    const leadRow = await prisma.lead.findUnique({ where: { id: lead.id } });
    check('lead.siteVisitDate still written', !!leadRow.siteVisitDate);
    check('lead.siteVisitStatus still written', !!leadRow.siteVisitStatus, leadRow.siteVisitStatus);

    /* ---- 3. confirm ------------------------------------------------------ */
    console.log('\n2. Screen posts "Site Visit Confirmed"');
    const r2 = await saveLead(lead.id, { siteVisitStatus: 'Site Visit Confirmed' });
    check('status became Confirmed', (await liveVisit(lead.id)).status === 'Confirmed');
    check('announced as "confirmed"', r2?.event === 'confirmed', r2?.event);

    /* ---- 4. reschedule --------------------------------------------------- */
    console.log('\n3. Screen posts "Re Scheduled Visit" with a new date');
    const newTime = hoursFromNow(72);
    const r3 = await saveLead(lead.id, { siteVisitStatus: 'Re Scheduled Visit', siteVisitDate: newTime });
    const v3 = await liveVisit(lead.id);
    check('time moved', new Date(v3.scheduledAt).getTime() === newTime.getTime());
    check('old time kept for the message', !!v3.previousAt);
    check('announced as "rescheduled"', r3?.event === 'rescheduled', r3?.event);
    check('reminders still armed', v3.remindersOff === false);
    const custResched = await prisma.siteVisitNotification.count({
      where: { siteVisitId: v3.id, audience: 'customer', event: 'rescheduled' },
    });
    check('customer told about the new time', custResched === 1, `${custResched}`);

    /* ---- 5. saving the same thing twice sends nothing extra -------------- */
    console.log('\n4. Saving the same state again is silent');
    const before = await prisma.siteVisitNotification.count({ where: { siteVisitId: v3.id } });
    await saveLead(lead.id, { siteVisitStatus: 'Re Scheduled Visit', siteVisitDate: newTime });
    await saveLead(lead.id, { siteVisitStatus: 'Re Scheduled Visit', siteVisitDate: newTime });
    const after = await prisma.siteVisitNotification.count({ where: { siteVisitId: v3.id } });
    check('no duplicate notifications', after === before, `${before} then ${after}`);

    /* ---- 6. complete ----------------------------------------------------- */
    console.log('\n5. Screen posts "Site Visit Done"');
    const r4 = await saveLead(lead.id, { siteVisitStatus: 'Site Visit Done', siteVisitDoneNote: 'Liked the 3BHK' });
    const v4 = await liveVisit(lead.id);
    check('status became Completed', v4.status === 'Completed', v4.status);
    check('reminders stopped', v4.remindersOff === true);
    check('announced as "completed"', r4?.event === 'completed', r4?.event);

    /* ---- 7. cancel on a second visit -------------------------------------- */
    console.log('\n6. A new booking, then Rejected → Cancelled');
    const lead2 = await makeLead(); leadIds.push(lead2.id);
    await saveLead(lead2.id, { status: 'Site Visit', siteVisitDate: hoursFromNow(24.02) });
    const r5 = await saveLead(lead2.id, { siteVisitStatus: 'Rejected' });
    const v5 = await liveVisit(lead2.id);
    check('status became Cancelled', v5.status === 'Cancelled', v5.status);
    check('reminders stopped', v5.remindersOff === true);
    check('announced as "cancelled"', r5?.event === 'cancelled', r5?.event);
    check('customer told it is off', (await prisma.siteVisitNotification.count({
      where: { siteVisitId: v5.id, audience: 'customer', event: 'cancelled' },
    })) === 1);
    await runReminderSweep();
    check('no reminder for a cancelled visit', (await prisma.siteVisitNotification.count({
      where: { siteVisitId: v5.id, event: { startsWith: 'reminder' } },
    })) === 0);

    /* ---- 8. a fresh booking after a cancellation --------------------------- */
    console.log('\n7. Booking again after a cancellation starts a new visit');
    await saveLead(lead2.id, { status: 'Site Visit', siteVisitDate: hoursFromNow(96) });
    const all = await prisma.siteVisit.findMany({ where: { leadId: lead2.id } });
    check('two separate visit records', all.length === 2, `${all.length}`);
    check('the cancelled one is untouched', all.filter((v) => v.status === 'Cancelled').length === 1);
    check('the new one is live', all.some((v) => v.status === 'Scheduled' && !v.remindersOff));

    /* ---- 9. reminders ------------------------------------------------------ */
    console.log('\n8. Reminders fire for a booking made this way');
    const lead3 = await makeLead(); leadIds.push(lead3.id);
    await saveLead(lead3.id, { status: 'Site Visit', siteVisitDate: hoursFromNow(1.8) });
    await runReminderSweep();
    const v6 = await liveVisit(lead3.id);
    const rem = await prisma.siteVisitNotification.count({
      where: { siteVisitId: v6.id, event: 'reminder-2h' },
    });
    check('2-hour reminder sent', rem > 0, `${rem} rows`);
    await runReminderSweep();
    check('a second sweep sends nothing more',
      (await prisma.siteVisitNotification.count({ where: { siteVisitId: v6.id, event: 'reminder-2h' } })) === rem);

    /* ---- 10. timeline ------------------------------------------------------ */
    console.log('\n9. It reaches the existing timeline and activity feed');
    const logs = await prisma.leadLog.findMany({ where: { leadId: lead.id } });
    check('timeline entries written', logs.some((l) => /site visit/i.test(l.title || '')),
      logs.filter((l) => /site visit/i.test(l.title || '')).length + ' entries');
    check('activity feed entry written',
      (await prisma.activity.count({ where: { entityId: lead.id, type: 'Site Visit' } })) > 0);

    /* ---- 11. a lead closed with no visit ----------------------------------- */
    console.log('\n10. Closing a lead that never had a visit invents nothing');
    const lead4 = await makeLead(); leadIds.push(lead4.id);
    const r7 = await saveLead(lead4.id, { siteVisitStatus: 'Rejected' });
    check('no phantom visit created', r7 === null && (await prisma.siteVisit.count({ where: { leadId: lead4.id } })) === 0);
  } finally {
    console.log('\nCleaning up…');
    const ids = (await prisma.siteVisit.findMany({ where: { leadId: { in: leadIds } }, select: { id: true } })).map((v) => v.id);
    await prisma.siteVisitNotification.deleteMany({ where: { siteVisitId: { in: ids } } }).catch(() => { });
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

  console.log(`\n${'='.repeat(66)}`);
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
