const prisma = require('../prismaClient');
const { sendMail } = require('./mailer');

/**
 * Reports emailed on a schedule — the weekly pipeline to managers, the daily
 * collections list to accounts. The background job calls runDueReports() once
 * a minute per company; a report is claimed by moving its nextRunAt before it
 * is built, so two sweeps never send it twice.
 */

const PERIOD_DAYS = { daily: 1, weekly: 7, monthly: 30 };

/** When a report sent now should next go out: 7am server time on the next day/week/month. */
function nextRunAfter(frequency, from = new Date()) {
  const next = new Date(from);
  if (frequency === 'daily') next.setDate(next.getDate() + 1);
  else if (frequency === 'monthly') next.setMonth(next.getMonth() + 1);
  else next.setDate(next.getDate() + 7);
  next.setHours(7, 0, 0, 0);
  return next;
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

function table(title, headers, rows) {
  if (!rows.length) return `<h3 style="margin:24px 0 8px">${esc(title)}</h3><p style="color:#666">Nothing in this period.</p>`;
  return `<h3 style="margin:24px 0 8px">${esc(title)}</h3>
  <table style="border-collapse:collapse;width:100%;max-width:640px">
    <tr>${headers.map((h) => `<th style="text-align:left;border-bottom:2px solid #ddd;padding:6px">${esc(h)}</th>`).join('')}</tr>
    ${rows.map((r) => `<tr>${r.map((c) => `<td style="border-bottom:1px solid #eee;padding:6px">${esc(c)}</td>`).join('')}</tr>`).join('')}
  </table>`;
}

async function pipelineReport(since) {
  const [total, byStatus, bySource, visits, bookings] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: since } } }),
    prisma.lead.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: { id: true } }),
    prisma.lead.groupBy({ by: ['primarySource'], where: { createdAt: { gte: since } }, _count: { id: true } }),
    prisma.siteVisit.count({ where: { scheduledAt: { gte: since } } }),
    prisma.booking.findMany({ where: { bookingDate: { gte: since }, status: { not: 'Cancelled' } }, select: { agreementValue: true } }),
  ]);
  const bookedValue = bookings.reduce((sum, b) => sum + Number(b.agreementValue || 0), 0);
  return `<p><strong>${total}</strong> new leads · <strong>${visits}</strong> site visits · <strong>${bookings.length}</strong> bookings worth <strong>${inr(bookedValue)}</strong></p>`
    + table('Leads by status', ['Status', 'Leads'], byStatus.sort((a, b) => b._count.id - a._count.id).map((r) => [r.status || '—', r._count.id]))
    + table('Leads by source', ['Source', 'Leads'], bySource.sort((a, b) => b._count.id - a._count.id).map((r) => [r.primarySource || '—', r._count.id]));
}

async function collectionsReport(since) {
  const now = new Date();
  const [milestones, payments] = await Promise.all([
    prisma.paymentMilestone.findMany({
      where: { dueDate: { lte: new Date(now.getTime() + 14 * 86400000) }, booking: { status: { not: 'Cancelled' } } },
      include: { booking: { include: { payments: true, milestones: true } } },
      orderBy: { dueDate: 'asc' },
      take: 200,
    }),
    prisma.payment.findMany({ where: { paidOn: { gte: since } }, include: { booking: true }, orderBy: { paidOn: 'desc' } }),
  ]);
  const { milestoneStatus } = require('./bookings');
  const open = milestones
    .map((m) => ({ m, st: milestoneStatus(m, m.booking) }))
    .filter(({ st }) => st.outstanding > 0);
  const received = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  return `<p><strong>${inr(received)}</strong> received in this period.</p>`
    + table('Due and overdue', ['Buyer', 'Milestone', 'Due', 'Outstanding', 'State'],
      open.map(({ m, st }) => [m.booking.buyerName, m.name, m.dueDate ? m.dueDate.toISOString().slice(0, 10) : '—', inr(st.outstanding), st.overdue ? 'OVERDUE' : 'Due soon']))
    + table('Payments received', ['Date', 'Buyer', 'Amount', 'Mode'],
      payments.map((p) => [p.paidOn.toISOString().slice(0, 10), p.booking.buyerName, inr(p.amount), p.mode || '—']));
}

async function activityReport(since) {
  const logs = await prisma.leadLog.groupBy({ by: ['actor'], where: { date: { gte: since } }, _count: { id: true } }).catch(() => []);
  const calls = await prisma.callLog.groupBy({ by: ['userId'], where: { startedAt: { gte: since } }, _count: { id: true } });
  return table('Lead updates by person', ['Person', 'Updates'], logs.sort((a, b) => b._count.id - a._count.id).map((r) => [r.actor || 'system', r._count.id]))
    + table('Calls placed', ['User', 'Calls'], calls.map((r) => [r.userId || '—', r._count.id]));
}

const BUILDERS = { pipeline: pipelineReport, collections: collectionsReport, activity: activityReport };

/** A report-builder report, run as the platform would see it (no per-user scope). */
async function customReport(report, since) {
  const saved = report.savedReportId ? await prisma.savedReport.findUnique({ where: { id: report.savedReportId } }) : null;
  if (!saved) return '<p>The saved report behind this schedule no longer exists.</p>';
  const { runReport, toHtml, ENTITIES } = require('./reportBuilder');
  const config = { ...saved.config };
  // A scheduled run covers the schedule's period on the report's date field.
  if (!config.dateFrom && !config.dateTo) config.dateFrom = since.toISOString().slice(0, 10);
  config.dateField = config.dateField || ENTITIES[config.entity]?.defaultDate;
  return toHtml(saved.name, await runReport(config, { status: 'superadmin' }));
}

/** Build a report's HTML for the period ending now. */
async function buildReport(report) {
  const since = new Date(Date.now() - (PERIOD_DAYS[report.frequency] || 7) * 86400000);
  const body = report.type === 'custom'
    ? await customReport(report, since)
    : await (BUILDERS[report.type] || pipelineReport)(since);
  return `<div style="font-family:Arial,sans-serif;padding:20px">
    <h2 style="margin:0 0 4px">${esc(report.name)}</h2>
    <p style="color:#666;margin:0 0 16px">${since.toISOString().slice(0, 10)} to ${new Date().toISOString().slice(0, 10)}</p>
    ${body}
    <p style="color:#999;font-size:12px;margin-top:24px">Scheduled report from NexorCRM</p>
  </div>`;
}

/** Send one report now to its recipients. */
async function sendReport(report) {
  const html = await buildReport(report);
  const recipients = (report.recipients || []).filter(Boolean);
  if (!recipients.length) return { status: 'skipped', error: 'no recipients' };
  return sendMail({ to: recipients, subject: report.name, html, category: 'report' });
}

/** Send every report that is due for the current company. */
async function runDueReports() {
  const due = await prisma.scheduledReport.findMany({
    where: { enabled: true, nextRunAt: { lte: new Date() } },
    take: 20,
  });
  let sent = 0;
  for (const report of due) {
    const claim = await prisma.scheduledReport.updateMany({
      where: { id: report.id, nextRunAt: report.nextRunAt },
      data: { nextRunAt: nextRunAfter(report.frequency), lastSentAt: new Date() },
    });
    if (claim.count !== 1) continue;
    try {
      await sendReport(report);
      sent += 1;
    } catch (error) {
      console.error(`Scheduled report "${report.name}" failed:`, error.message);
    }
  }
  return sent;
}

module.exports = { runDueReports, sendReport, buildReport, nextRunAfter };
