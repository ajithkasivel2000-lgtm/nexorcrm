/**
 * The reminder engine. One sweep, every activity, no per-module loops.
 *
 * WHAT IT DOES
 * For each activity that has a time (see reminderSources.js), it works out
 * which reminders in the series are due now, and sends the ones nobody has sent
 * yet. The default series is the one asked for: start three hours out, repeat
 * every thirty minutes, so a 6:00pm follow-up reminds at 3:00, 3:30, 4:00,
 * 4:30, 5:00 and 5:30 — then keeps going once it is late, if overdue reminders
 * are on, escalating to the owner's manager after it has been late long enough.
 *
 * NO SCHEDULER OF ITS OWN
 * It is a function the existing lead-reassignment sweep calls on its tick, the
 * same way the site-visit reminders already do. One interval in the process,
 * one place to look when something did not fire, and nothing on the front end
 * polling for any of it.
 *
 * HOW DUPLICATES ARE IMPOSSIBLE
 * Not by a "reminded" flag, which goes stale and needs migrating. A slot is
 * claimed by INSERTING a ReminderLog row whose unique index covers
 * (activity, due time, slot, recipient, channel). Two ticks racing, or two
 * servers, both attempt the insert; one wins, the other takes a unique
 * violation and moves on. The row IS the record that it was sent.
 *
 * HOW CANCELLING AND RESCHEDULING WORK — WITH NO CANCELLING CODE
 * Every tick recomputes from the live rows. An activity that is completed or
 * cancelled no longer matches its own query, so it is simply never found
 * again. A rescheduled one has a new due time, and the due time is part of the
 * dedup key, so it gets a fresh series while the old slots can never fire
 * again. There is nothing to clean up and nothing to leak.
 */

const prisma = require('../prismaClient');
const { SOURCES } = require('./reminderSources');
/* The existing two channels, used exactly as the rest of the CRM uses them:
   notify() writes the bell row and trims that user's tail, sendToUser() pushes
   to whatever browsers they have subscribed. No new notification path. */
const { notify } = require('../controllers/notificationController');
const { sendToUser } = require('./push');

/** The settings row, created on first use like the other settings tables. */
async function getSettings() {
  try {
    const existing = await prisma.reminderSetting.findFirst({ orderBy: { createdAt: 'asc' } });
    if (existing) return existing;
    return await prisma.reminderSetting.create({ data: {} });
  } catch (error) {
    /* A settings read must never stop reminders entirely: fall back to the
       documented defaults rather than going quiet. */
    console.error('Reminder settings unavailable, using defaults:', error.message);
    return {
      enabled: true, leadMinutes: 180, repeatMinutes: 30, maxReminders: 0,
      overdueEnabled: true, overdueRepeatMinutes: 60, escalateAfterMinutes: 120,
      maxOverdueReminders: 4,
      channelInApp: true, channelPush: true, channelEmail: false,
    };
  }
}

/** Minute precision is enough to key a reminder, and keeps the key stable. */
const dueKeyOf = (due) => new Date(due).toISOString().slice(0, 16);

/**
 * Which reminder in the series is due for this activity right now.
 *
 * Returns a slot name, or null when the activity is outside its window. The
 * name is derived from the time remaining — never from a counter — so the same
 * instant always produces the same slot. That is what makes the dedup key
 * stable across ticks and across processes.
 */
function slotFor(due, now, settings) {
  const minutesLeft = Math.floor((new Date(due).getTime() - now.getTime()) / 60000);

  if (minutesLeft > 0) {
    if (minutesLeft > settings.leadMinutes) return null;      // too early to nag
    const step = Math.max(1, settings.repeatMinutes);
    /* Rounded UP, so the reminder scheduled for "180 minutes before" owns every
       tick from 180 minutes out down to 151 — one slot, held for the whole of
       its half hour. Rounding down instead names a new slot the minute after
       the first one fires, which turns a six-reminder series into one reminder
       per sweep. */
    const bucket = Math.ceil(minutesLeft / step) * step;
    if (settings.maxReminders > 0) {
      const index = Math.round((settings.leadMinutes - bucket) / step);
      if (index >= settings.maxReminders) return null;
    }
    return 'T-' + bucket;
  }

  /* Exactly due. Its own slot rather than the first overdue one, so the
     message reads "due" and not "overdue" at the very moment it comes up. */
  if (minutesLeft === 0) return 'T-0';

  if (!settings.overdueEnabled) return null;
  const step = Math.max(1, settings.overdueRepeatMinutes);
  /* The overdue slot, named by minutes late as before: 0, then step, 2*step…
     The key must keep its old format — it is the dedup key against ReminderLog
     rows already sent, and renaming it would re-fire one duplicate per
     activity still mid-chase when this ships. */
  const slotIndex = Math.floor(Math.abs(minutesLeft) / step);

  /* A cap on the overdue series, like the pre-due series has with
     maxReminders. Without it the sweep chased an activity nobody had closed
     every interval, forever. slotIndex 0 is the first overdue reminder, so a
     cap of N allows slotIndexes 0…N-1 — N reminders in total. 0 keeps the old
     uncapped behaviour; the default (4) is about a working day of chasing at
     the default interval. */
  const cap = settings.maxOverdueReminders;
  if (Number.isFinite(cap) && cap > 0 && slotIndex >= cap) return null;

  return 'overdue-' + slotIndex * step;
}

/** owner/assignedTo hold a username on some rows and an id on others. */
async function resolveUser(who) {
  if (!who) return null;
  try {
    return await prisma.user.findFirst({
      where: { OR: [{ id: String(who) }, { username: String(who) }] },
      select: { id: true, username: true, email: true, reporting_to: true, status: true },
    });
  } catch {
    return null;
  }
}

/** Who else hears about it once it is late enough: the manager, then admins. */
async function escalationTargets(owner) {
  const out = [];
  if (owner && owner.reporting_to) {
    const manager = await resolveUser(owner.reporting_to);
    if (manager && manager.id !== owner.id) out.push(manager);
  }
  if (out.length === 0) {
    /* Nobody named as a manager, so the people whose job it is by role. The
       superadmin is left out: it is not a person who works leads.

       The lookup has to match how this app actually stores administrators.
       The original company's admins carry status 'Admin' (or 'superadmin' for
       the platform account), but a company created through "Start a free
       trial" gets status 'superadmin' — see provisionCompany() — so an 'Admin'
       -only query found nobody and overdue escalations silently went nowhere
       in exactly the companies that sign themselves up. The same people are
       also reachable by userlevel >= 9 (requireAdmin's fallback), and archived
       or deactivated accounts are skipped: they cannot be told anything. */
    const admins = await prisma.user.findMany({
      where: {
        OR: [
          { status: { in: ['Admin', 'Manager'] } },
          { status: 'superadmin' },
          { userlevel: { gte: 9 } },
        ],
        archivedAt: null,
        NOT: { username: 'admin' },
      },
      select: { id: true, username: true, email: true, status: true },
      take: 5,
    });
    out.push(...admins.filter((a) => !owner || a.id !== owner.id));
  }
  return out;
}

/**
 * Claim one slot, for one recipient, on one channel.
 *
 * @returns true when this call is the one that may send it.
 */
async function claim(key) {
  try {
    await prisma.reminderLog.create({ data: key });
    return true;
  } catch (error) {
    // P2002 is the unique index doing its job: somebody already sent this one.
    if (error.code === 'P2002') return false;
    console.error('Could not claim a reminder slot:', error.message);
    return false;
  }
}

/** One activity, one recipient: send whichever channels are on and unclaimed. */
async function deliver({ source, row, due, slot, user, audience, settings, overdue }) {
  const title = source.titleOf(row) || source.label;
  const when = new Date(due).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const heading = overdue
    ? source.label + ' overdue: ' + title
    : source.label + ' due: ' + title;
  const body = overdue
    ? 'Was due ' + when + '.' + (audience === 'owner' ? '' : ' The owner has not actioned it.')
    : 'Due ' + when + '.';
  const url = source.urlOf(row);

  const base = {
    activityType: source.type,
    activityId: String(row.id),
    dueAtKey: dueKeyOf(due),
    slot,
    recipientId: user.id,
    audience,
  };

  let sent = 0;

  if (settings.channelInApp && await claim({ ...base, channel: 'bell' })) {
    /* kind 'reminder' so the bell can tell these apart from lead activity,
       and url so clicking one opens the record it is about. */
    await notify(user.id, { title: heading, body, url, kind: 'reminder' })
      .catch((e) => console.error('Reminder bell failed:', e.message));
    sent += 1;
  }

  if (settings.channelPush && await claim({ ...base, channel: 'push' })) {
    /* Push is best-effort by nature — the browser may hold no subscription.
       The claim still stands, so a device that cannot receive one is not
       retried on every tick forever. */
    await sendToUser(user.id, { title: heading, body, url, tag: 'reminder' })
      .catch((e) => console.error('Reminder push failed:', e.message));
    sent += 1;
  }

  return sent;
}

/**
 * Send every reminder that is due.
 *
 * @returns {Promise<{checked:number,sent:number,escalated:number,errors:number}>}
 */
async function runReminderSweep({ now = new Date(), limit = 500 } = {}) {
  const summary = { checked: 0, sent: 0, escalated: 0, errors: 0, skipped: 0 };

  const settings = await getSettings();
  if (!settings.enabled) return { ...summary, disabled: true };

  /* The widest window anything could be due in: from however far back overdue
     reminders still care about, to the first reminder's lead time ahead. */
  const from = settings.overdueEnabled
    ? new Date(now.getTime() - 7 * 24 * 60 * 60000)      // a week of lateness
    : now;
  const to = new Date(now.getTime() + settings.leadMinutes * 60000);

  for (const source of SOURCES) {
    let rows = [];
    try {
      // eslint-disable-next-line no-await-in-loop
      rows = await source.find(from, to);
    } catch (error) {
      /* One module's query failing must not stop the others — the same lesson
         the dashboard learned when a single count took the whole screen down. */
      console.error('Reminders: could not list ' + source.type + ':', error.message);
      summary.errors += 1;
      continue;
    }

    for (const row of rows.slice(0, limit)) {
      summary.checked += 1;
      try {
        const due = source.dueAt(row);
        if (!due) continue;

        const slot = slotFor(due, now, settings);
        if (!slot) { summary.skipped += 1; continue; }

        // eslint-disable-next-line no-await-in-loop
        const owner = await resolveUser(source.ownerOf(row));
        if (!owner) { summary.skipped += 1; continue; }

        const overdue = slot.indexOf('overdue') === 0;

        // eslint-disable-next-line no-await-in-loop
        summary.sent += await deliver({
          source, row, due, slot, user: owner, audience: 'owner', settings, overdue,
        });

        /* Escalation: only once it has been late longer than the setting says,
           and only when a figure is configured at all. */
        if (overdue && settings.escalateAfterMinutes > 0) {
          const lateBy = Math.floor((now.getTime() - new Date(due).getTime()) / 60000);
          if (lateBy >= settings.escalateAfterMinutes) {
            // eslint-disable-next-line no-await-in-loop
            const targets = await escalationTargets(owner);
            for (const manager of targets) {
              // eslint-disable-next-line no-await-in-loop
              const n = await deliver({
                source, row, due, slot, user: manager, audience: 'manager', settings, overdue: true,
              });
              if (n > 0) summary.escalated += n;
            }
          }
        }
      } catch (error) {
        summary.errors += 1;
        console.error('Reminder failed for ' + source.type + ' ' + row.id + ':', error.message);
      }
    }
  }

  return summary;
}

module.exports = { runReminderSweep, slotFor, getSettings, dueKeyOf };
