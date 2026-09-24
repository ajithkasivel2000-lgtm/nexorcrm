/**
 * The 24-hour and 2-hour reminders.
 *
 * There is no new scheduler here on purpose: this is a function the existing
 * lead-reassignment sweep calls on the same tick. One interval, one process,
 * one place to look when something did not fire.
 *
 * A reminder is due when the visit is inside its window and still live. It is
 * not tracked with a "reminded" flag — the SiteVisitNotification row for
 * (visit, event, audience, channel, recipient) is the record, so a reminder
 * that has been sent cannot be claimed again however many times the sweep
 * runs or however many servers run it.
 */

const prisma = require('../prismaClient');
const { announce, retryFailed } = require('./siteVisitNotify');
const { gatherVisitDetails, TERMINAL_STATUSES } = require('./siteVisit');

/**
 * The windows, in minutes before the visit.
 *
 * `grace` is how late a reminder may still be sent. A server that was down
 * over the 2-hour mark should still warn someone with 90 minutes to go; one
 * that was down all day should not send "your visit is in 2 hours" after it
 * has already happened. Past the grace, the window is simply missed.
 */
const WINDOWS = [
  { event: 'reminder-24h', minutesBefore: 24 * 60, grace: 6 * 60 },
  { event: 'reminder-2h', minutesBefore: 2 * 60, grace: 60 },
];

/**
 * Send whatever reminders are due.
 *
 * @returns {Promise<{checked:number,sent:number,retried:number,errors:number}>}
 */
async function runReminderSweep({ now = new Date(), limit = 200 } = {}) {
  const summary = { checked: 0, sent: 0, retried: 0, errors: 0 };

  for (const window of WINDOWS) {
    const target = new Date(now.getTime() + window.minutesBefore * 60000);
    // Everything from the target back to the end of its grace period.
    const earliest = new Date(target.getTime() - window.grace * 60000);

    let due = [];
    try {
      // eslint-disable-next-line no-await-in-loop
      due = await prisma.siteVisit.findMany({
        where: {
          remindersOff: false,
          status: { notIn: TERMINAL_STATUSES },
          scheduledAt: { lte: target, gte: earliest },
        },
        orderBy: { scheduledAt: 'asc' },
        take: limit,
      });
    } catch (error) {
      console.error('Could not list site visits due a reminder:', error.message);
      summary.errors += 1;
      continue;
    }

    for (const visit of due) {
      summary.checked += 1;
      try {
        /* The visit must not already be past. A 2-hour reminder for something
           that started ten minutes ago helps nobody. */
        if (new Date(visit.scheduledAt) <= now) continue;

        // eslint-disable-next-line no-await-in-loop
        const details = await gatherVisitDetails(visit.leadId);
        // eslint-disable-next-line no-await-in-loop
        const out = await announce(visit, window.event, details);
        if (out.internal?.length || out.customer?.sent) summary.sent += 1;
      } catch (error) {
        summary.errors += 1;
        console.error(`Reminder failed for site visit ${visit.id}:`, error.message);
      }
    }
  }

  /* Anything that failed earlier gets another go on the same tick, which is
     the retry the requirement asks for — capped, so a permanently bad address
     is attempted a few times and then left alone in the history. */
  try {
    summary.retried = await retryFailed();
  } catch (error) {
    console.error('Site visit notification retry failed:', error.message);
    summary.errors += 1;
  }

  return summary;
}

module.exports = { runReminderSweep, WINDOWS };
