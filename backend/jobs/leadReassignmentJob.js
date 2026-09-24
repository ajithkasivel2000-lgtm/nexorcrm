/**
 * The background sweep that moves unanswered leads along.
 *
 * There is no scheduler in this codebase to hang this off — no cron, no queue,
 * no worker — so it is a plain interval started with the server. That is
 * enough because the job holds no state: the deadlines are rows, so the sweep
 * is only ever asking "what is due now?". Miss a tick, restart the process,
 * run two of them, and the answer is the same, and each due lead is still
 * claimed exactly once by whichever sweep reaches it first.
 *
 * The interval is how often it *looks*, which is not the follow-up window
 * itself — that is the configurable setting. Looking every minute means a
 * 30-minute lead moves between 30:00 and 30:59 after assignment, which is the
 * right trade for a window measured in tens of minutes.
 */

const prisma = require('../prismaClient');
const { runAsSystem, runWithCompany } = require('../utils/tenant');
const { runReassignmentSweep } = require('../utils/leadAssignment');
const { runReminderSweep } = require('../utils/siteVisitReminders');
const { runReminderSweep: runActivityReminders } = require('../utils/reminders');
const { retryQueuedMail } = require('../utils/mailer');
const { runDueReports } = require('../utils/scheduledReports');
const { sweepSubscription } = require('../utils/billing');

/** How often to look for expired windows. Not the window itself. */
const SWEEP_INTERVAL_MS = 60 * 1000;

/** Give the database a moment after boot before the first sweep. */
const FIRST_SWEEP_DELAY_MS = 10 * 1000;

let timer = null;
/* A sweep that overruns must not have a second one started on top of it. The
   database would cope — every move is claimed — but the log would be noise. */
let running = false;

/* Everything that rides the one tick, in order. Each is wrapped on its own so
   one failing cannot stop the others, and each runs once per company, inside
   that company (utils/tenant.js) — the sweeps only ever see its rows. */
const TASKS = [
  ['lead-reassignment', runReassignmentSweep, (r) => r && (r.reassigned || r.errors || r.cancelled)],
  ['site-visit-reminders', runReminderSweep, (r) => r && (r.sent || r.errors || r.retried)],
  ['reminders', runActivityReminders, (r) => r && (r.sent || r.escalated || r.errors)],
  ['mail-retry', retryQueuedMail, (r) => r > 0],
  ['scheduled-reports', runDueReports, (r) => r > 0],
  // Trials and grace periods that have run out are marked expired.
  ['subscription', (company) => sweepSubscription(company.id), (r) => Boolean(r)],
];

async function sweepCompany(company) {
  for (const [name, task, worthLogging] of TASKS) {
    try {
      const result = await task(company);
      if (worthLogging(result)) console.log(`[${name}] ${company.slug}`, JSON.stringify(result));
    } catch (error) {
      // Never let a bad sweep kill the interval; the next one may well work.
      console.error(`[${name}] ${company.slug} sweep failed:`, error.message);
    }
  }
}

async function sweepOnce() {
  if (running) return null;
  running = true;
  try {
    const companies = await runAsSystem(() => prisma.company.findMany({
      where: { status: 'Active' },
      select: { id: true, slug: true },
    }));
    for (const company of companies) {
      await runWithCompany(company.id, () => sweepCompany(company));
    }
  } catch (error) {
    console.error('[sweep] could not list companies:', error.message);
  } finally {
    running = false;
  }
  return null;
}

/** Start sweeping. Safe to call twice; the second call is ignored. */
function startLeadReassignmentJob({ intervalMs = SWEEP_INTERVAL_MS } = {}) {
  if (timer) return timer;

  setTimeout(() => { sweepOnce(); }, FIRST_SWEEP_DELAY_MS).unref?.();

  timer = setInterval(() => { sweepOnce(); }, intervalMs);
  // Do not hold the process open on this alone.
  timer.unref?.();

  console.log(`[lead-reassignment] sweeping every ${Math.round(intervalMs / 1000)}s`);
  return timer;
}

function stopLeadReassignmentJob() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startLeadReassignmentJob, stopLeadReassignmentJob, sweepOnce, SWEEP_INTERVAL_MS };
