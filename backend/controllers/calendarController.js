const crypto = require('crypto');
const prisma = require('../prismaClient');
const tenant = require('../utils/tenant');
const { sendError } = require('../utils/apiError');

/**
 * A personal calendar feed (iCalendar / .ics) of what a person has to do:
 * their site visits, lead follow-ups, tasks and opportunity follow-ups.
 *
 * Google Calendar, Outlook and Apple Calendar all subscribe to a feed URL and
 * refresh it themselves — no OAuth, no per-provider code. The URL carries a
 * long random token instead of a login (a calendar app cannot sign in), so it
 * is private: anyone with the link sees the calendar. Rotating the token
 * kills the old link.
 *
 *   GET  /api/calendar/link          my feed URL (made on first request)
 *   POST /api/calendar/link/rotate   a new URL; the old one stops working
 *   GET  /api/calendar/feed/:token.ics
 */

const newToken = () => crypto.randomBytes(24).toString('hex');

const feedUrl = (req, token) => {
  const base = String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  return `${base}/api/calendar/feed/${token}.ics`;
};

exports.getLink = async (req, res) => {
  try {
    let { calendarToken } = await prisma.user.findUnique({ where: { id: req.user.id }, select: { calendarToken: true } });
    if (!calendarToken) {
      calendarToken = newToken();
      await prisma.user.update({ where: { id: req.user.id }, data: { calendarToken } });
    }
    res.status(200).json({ url: feedUrl(req, calendarToken) });
  } catch (error) {
    sendError(res, error, 'Could not create your calendar link', 500);
  }
};

exports.rotateLink = async (req, res) => {
  try {
    const calendarToken = newToken();
    await prisma.user.update({ where: { id: req.user.id }, data: { calendarToken } });
    res.status(200).json({ url: feedUrl(req, calendarToken) });
  } catch (error) {
    sendError(res, error, 'Could not rotate your calendar link', 500);
  }
};

/* ---- iCalendar ------------------------------------------------------------ */

const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 octets must be folded (RFC 5545 §3.1). */
const fold = (line) => {
  const out = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
};

function vevent({ uid, start, minutes = 30, summary, description, location, url }) {
  const end = new Date(new Date(start).getTime() + minutes * 60000);
  return [
    'BEGIN:VEVENT',
    `UID:${uid}@nexorcrm`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(summary)}`,
    description ? `DESCRIPTION:${icsText(description)}` : null,
    location ? `LOCATION:${icsText(location)}` : null,
    url ? `URL:${icsText(url)}` : null,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(summary)}`, 'TRIGGER:-PT30M', 'END:VALARM',
    'END:VEVENT',
  ].filter(Boolean).map(fold).join('\r\n');
}

exports.feed = (req, res) => tenant.runResolving(async () => {
  try {
    const token = String(req.params.token || '').replace(/\.ics$/, '');
    if (token.length < 32) return res.sendStatus(404);
    const user = await prisma.user.findUnique({ where: { calendarToken: token } });
    if (!user) return res.sendStatus(404);
    tenant.adopt(user.companyId);

    const base = String(process.env.APP_URL || '').replace(/\/+$/, '');
    const from = new Date(Date.now() - 30 * 86400000);
    const to = new Date(Date.now() + 180 * 86400000);
    const mine = { OR: [{ ownerId: user.id }, { owner: user.username }, { owner: user.id }] };

    const [visits, leads, tasks, opps] = await Promise.all([
      prisma.siteVisit.findMany({
        where: { scheduledAt: { gte: from, lte: to }, status: { notIn: ['Cancelled', 'Canceled'] }, OR: [{ assignedToId: user.id }, { lead: mine }] },
        take: 500,
      }),
      prisma.lead.findMany({ where: { ...mine, followUpDate: { gte: from, lte: to } }, select: { id: true, name: true, mobile: true, followUpDate: true, status: true }, take: 500 }),
      prisma.task.findMany({ where: { OR: [{ assignedTo: user.id }, { assignedTo: user.username }], dueDate: { gte: from, lte: to }, status: { not: 'Completed' } }, take: 500 }),
      prisma.opportunity.findMany({
        where: { OR: [{ opportunityOwner: user.username }, { opportunityOwner: user.id }], nextFollowUpDate: { gte: from, lte: to } },
        select: { id: true, opportunityName: true, nextFollowUpDate: true, stage: true }, take: 500,
      }),
    ]);

    const events = [
      ...visits.map((v) => vevent({
        uid: `visit-${v.id}`, start: v.scheduledAt, minutes: 60,
        summary: `Site visit: ${v.customerName || 'customer'}${v.projectName ? ` · ${v.projectName}` : ''}`,
        description: [v.customerPhone && `Phone: ${v.customerPhone}`, v.note].filter(Boolean).join('\n'),
        location: v.projectAddress || v.projectName, url: base && `${base}/leads/${v.leadId}`,
      })),
      ...leads.map((l) => vevent({
        uid: `lead-${l.id}`, start: l.followUpDate,
        summary: `Follow up: ${l.name}`, description: `Lead ${l.id} · ${l.status}\nPhone: ${l.mobile}`,
        url: base && `${base}/leads/${l.id}`,
      })),
      ...tasks.map((t) => vevent({
        uid: `task-${t.id}`, start: t.dueDate, summary: `Task: ${t.title}`, description: t.description,
      })),
      ...opps.map((o) => vevent({
        uid: `opp-${o.id}`, start: o.nextFollowUpDate,
        summary: `Opportunity follow-up: ${o.opportunityName || o.id}`, description: `Stage: ${o.stage}`,
        url: base && `${base}/opportunities/${o.id}`,
      })),
    ];

    const body = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NexorCRM//Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      fold(`X-WR-CALNAME:${icsText(`NexorCRM — ${user.firstName || user.username}`)}`),
      'X-PUBLISHED-TTL:PT15M', 'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
      ...events,
      'END:VCALENDAR',
    ].join('\r\n');
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Cache-Control', 'private, max-age=300');
    return res.status(200).send(`${body}\r\n`);
  } catch (error) {
    console.error('Calendar feed failed:', error.message);
    return res.sendStatus(500);
  }
});
