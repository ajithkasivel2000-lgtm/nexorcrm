const prisma = require('../prismaClient');
const { isSuperUser } = require('../middleware/authMiddleware');

/**
 * The report builder: a report is { entity, columns, filters, dateField,
 * dateFrom, dateTo, groupBy, metric, sort, limit }, turned into a Prisma
 * query here. Only the fields listed below can be selected, filtered, grouped
 * or summed — a report can never reach a column that is not meant to be seen.
 */

const S = 'string'; const N = 'number'; const D = 'date';
const f = (key, label, type = S, opts = {}) => ({ key, label, type, groupable: type !== D && type !== N, ...opts });

const ENTITIES = {
  leads: {
    label: 'Leads', model: 'lead', defaultDate: 'createdAt',
    fields: [
      f('id', 'Lead ID', S, { groupable: false }), f('name', 'Name', S, { groupable: false }), f('mobile', 'Mobile', S, { groupable: false }),
      f('email', 'Email', S, { groupable: false }), f('status', 'Status'), f('primarySource', 'Primary source'),
      f('secondarySource', 'Secondary source'), f('project', 'Project', S, { resolve: 'project' }),
      f('ownerId', 'Owner', S, { resolve: 'user' }), f('rating', 'Rating'), f('channelPartnerName', 'Channel partner'),
      f('callStatus', 'Call status'), f('siteVisitStatus', 'Site visit status'), f('bookingStatus', 'Booking status'),
      f('createdAt', 'Created', D), f('followUpDate', 'Follow-up', D), f('siteVisitDate', 'Site visit', D),
    ],
  },
  opportunities: {
    label: 'Opportunities', model: 'opportunity', defaultDate: 'createdAt',
    fields: [
      f('id', 'Opportunity ID', S, { groupable: false }), f('opportunityName', 'Name', S, { groupable: false }),
      f('stage', 'Stage'), f('status', 'Status'), f('opportunityOwner', 'Owner', S, { resolve: 'user' }),
      f('source', 'Source'), f('LeadsProject', 'Project', S, { resolve: 'project' }), f('channelPartnerName', 'Channel partner'),
      f('priority', 'Priority'), f('expectedValue', 'Expected value', N, { summable: true }),
      f('agreementValue', 'Agreement value', N, { summable: true }), f('amountPaid', 'Amount paid', N, { summable: true }),
      f('probability', 'Probability %', N), f('createdAt', 'Created', D), f('bookingDate', 'Booking date', D),
      f('expectedCloseDate', 'Expected close', D),
    ],
  },
  bookings: {
    label: 'Bookings', model: 'booking', defaultDate: 'bookingDate',
    fields: [
      f('id', 'Booking ID', S, { groupable: false }), f('buyerName', 'Buyer', S, { groupable: false }),
      f('buyerMobile', 'Buyer mobile', S, { groupable: false }), f('projectId', 'Project', S, { resolve: 'project' }),
      f('status', 'Status'), f('channelPartnerId', 'Channel partner', S, { resolve: 'partner' }), f('createdBy', 'Booked by'),
      f('agreementValue', 'Agreement value', N, { summable: true }), f('bookingAmount', 'Booking amount', N, { summable: true }),
      f('bookingDate', 'Booking date', D),
    ],
  },
  payments: {
    label: 'Payments received', model: 'payment', defaultDate: 'paidOn',
    fields: [
      f('receiptNo', 'Receipt', S, { groupable: false }), f('bookingId', 'Booking', S, { groupable: false }),
      f('mode', 'Mode'), f('recordedBy', 'Recorded by'), f('amount', 'Amount', N, { summable: true }), f('paidOn', 'Paid on', D),
    ],
  },
  siteVisits: {
    label: 'Site visits', model: 'siteVisit', defaultDate: 'scheduledAt',
    fields: [
      f('customerName', 'Customer', S, { groupable: false }), f('projectName', 'Project'), f('assignedToName', 'Host'),
      f('status', 'Status'), f('outcome', 'Outcome'), f('scheduledAt', 'Scheduled', D), f('createdAt', 'Booked on', D),
    ],
  },
  calls: {
    label: 'Calls', model: 'callLog', defaultDate: 'startedAt',
    fields: [
      f('userId', 'Caller', S, { resolve: 'user' }), f('status', 'Status'), f('direction', 'Direction'),
      f('toNumber', 'Number', S, { groupable: false }), f('durationSec', 'Duration (s)', N, { summable: true }),
      f('startedAt', 'When', D),
    ],
  },
};

const OPS = ['eq', 'neq', 'contains', 'in', 'gte', 'lte', 'empty', 'notEmpty'];
const MAX_ROWS = 5000;

const schema = () => Object.entries(ENTITIES).map(([key, e]) => ({
  key, label: e.label, defaultDate: e.defaultDate,
  fields: e.fields.map(({ key: k, label, type, groupable, summable }) => ({ key: k, label, type, groupable, summable: Boolean(summable) })),
}));

function coerce(field, value) {
  if (field.type === N) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw Object.assign(new Error(`${field.label} needs a number.`), { status: 400 });
    return n;
  }
  if (field.type === D) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw Object.assign(new Error(`${field.label} needs a date.`), { status: 400 });
    return d;
  }
  return String(value);
}

function buildWhere(entity, config) {
  const byKey = new Map(entity.fields.map((x) => [x.key, x]));
  const and = [];
  for (const flt of config.filters || []) {
    const field = byKey.get(flt.field);
    if (!field) throw Object.assign(new Error(`Unknown filter field "${flt.field}".`), { status: 400 });
    if (!OPS.includes(flt.op)) throw Object.assign(new Error(`Unknown filter "${flt.op}".`), { status: 400 });
    const k = field.key;
    switch (flt.op) {
      case 'eq': and.push({ [k]: coerce(field, flt.value) }); break;
      case 'neq': and.push({ NOT: { [k]: coerce(field, flt.value) } }); break;
      case 'contains': and.push({ [k]: { contains: String(flt.value), mode: 'insensitive' } }); break;
      case 'in': and.push({ [k]: { in: (Array.isArray(flt.value) ? flt.value : String(flt.value).split(',')).map((v) => coerce(field, String(v).trim())) } }); break;
      case 'gte': and.push({ [k]: { gte: coerce(field, flt.value) } }); break;
      case 'lte': and.push({ [k]: { lte: coerce(field, flt.value) } }); break;
      case 'empty': and.push({ OR: [{ [k]: null }, ...(field.type === S ? [{ [k]: '' }] : [])] }); break;
      case 'notEmpty': and.push({ NOT: { OR: [{ [k]: null }, ...(field.type === S ? [{ [k]: '' }] : [])] } }); break;
      default: break;
    }
  }
  const dateField = byKey.get(config.dateField || entity.defaultDate);
  if (dateField && (config.dateFrom || config.dateTo)) {
    const range = {};
    if (config.dateFrom) range.gte = coerce(dateField, config.dateFrom);
    if (config.dateTo) { const to = coerce(dateField, config.dateTo); to.setHours(23, 59, 59, 999); range.lte = to; }
    and.push({ [dateField.key]: range });
  }
  return and.length ? { AND: and } : {};
}

/** Leads follow the list's rule: managers see staff-owned leads only. */
async function leadScope(user) {
  if (isSuperUser(user)) return null;
  const staff = await prisma.user.findMany({ where: { status: { in: ['Manager', 'Employee'] } }, select: { id: true, username: true } });
  return { OR: [{ ownerId: { in: staff.map((u) => u.id) } }, { owner: { in: staff.map((u) => u.username) } }] };
}

/** Lookups that turn ids into names for display. */
async function resolvers() {
  const [users, projects, partners] = await Promise.all([
    prisma.user.findMany({ select: { id: true, username: true, firstName: true, lastName: true } }),
    prisma.project.findMany({ select: { id: true, projectName: true } }),
    prisma.channelPartner.findMany({ select: { id: true, companyName: true } }),
  ]);
  const userName = new Map();
  users.forEach((u) => {
    const n = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username;
    userName.set(u.id, n); userName.set(u.username, n);
  });
  const projectName = new Map();
  projects.forEach((p) => { projectName.set(p.id, p.projectName); projectName.set(p.projectName, p.projectName); });
  const partnerName = new Map(partners.map((p) => [p.id, p.companyName]));
  return {
    user: (v) => (v == null ? v : userName.get(v) || v),
    project: (v) => (v == null ? v : projectName.get(v) || v),
    partner: (v) => (v == null ? v : partnerName.get(v) || v),
  };
}

const display = (field, value, r) => {
  if (value == null) return null;
  if (field.resolve) return r[field.resolve](value);
  if (field.type === N) return Number(value);
  if (value instanceof Date) return value.toISOString();
  return value;
};

/**
 * Run a report for this user. Returns { columns, rows } — or, grouped,
 * { grouped: true, columns: [group, count, sum?], rows }.
 */
async function runReport(config, user) {
  const entity = ENTITIES[config?.entity];
  if (!entity) throw Object.assign(new Error('Choose what to report on.'), { status: 400 });
  const byKey = new Map(entity.fields.map((x) => [x.key, x]));
  let where = buildWhere(entity, config);
  if (config.entity === 'leads') {
    const scope = await leadScope(user);
    if (scope) where = { AND: [where, scope] };
  }
  const r = await resolvers();
  const model = prisma[entity.model];

  if (config.groupBy) {
    const group = byKey.get(config.groupBy);
    if (!group || !group.groupable) throw Object.assign(new Error('That field cannot be grouped by.'), { status: 400 });
    const metricField = config.metric?.field ? byKey.get(config.metric.field) : null;
    if (config.metric?.field && (!metricField || !metricField.summable)) {
      throw Object.assign(new Error('That field cannot be added up.'), { status: 400 });
    }
    const out = await model.groupBy({
      by: [group.key], where, _count: { _all: true },
      ...(metricField ? { _sum: { [metricField.key]: true }, _avg: { [metricField.key]: true } } : {}),
    });
    const rows = out.map((g) => ({
      group: display(group, g[group.key], r) ?? '(blank)',
      count: g._count._all,
      ...(metricField ? {
        sum: Number(g._sum[metricField.key] || 0),
        avg: Math.round(Number(g._avg[metricField.key] || 0) * 100) / 100,
      } : {}),
    }));
    const sortKey = config.metric?.op === 'sum' && metricField ? 'sum' : 'count';
    rows.sort((a, b) => b[sortKey] - a[sortKey]);
    return {
      grouped: true,
      columns: [
        { key: 'group', label: group.label },
        { key: 'count', label: 'Count', type: N },
        ...(metricField ? [{ key: 'sum', label: `Total ${metricField.label}`, type: N }, { key: 'avg', label: `Average ${metricField.label}`, type: N }] : []),
      ],
      rows,
    };
  }

  const cols = (config.columns && config.columns.length ? config.columns : entity.fields.slice(0, 6).map((x) => x.key))
    .map((k) => byKey.get(k)).filter(Boolean);
  if (!cols.length) throw Object.assign(new Error('Choose at least one column.'), { status: 400 });
  const sortField = byKey.get(config.sort?.field) || byKey.get(entity.defaultDate);
  const rows = await model.findMany({
    where,
    select: Object.fromEntries(cols.map((c) => [c.key, true])),
    orderBy: sortField ? { [sortField.key]: config.sort?.dir === 'asc' ? 'asc' : 'desc' } : undefined,
    take: Math.min(Number(config.limit) || 1000, MAX_ROWS),
  });
  return {
    grouped: false,
    columns: cols.map(({ key, label, type }) => ({ key, label, type })),
    rows: rows.map((row, i) => ({ _row: i + 1, ...Object.fromEntries(cols.map((c) => [c.key, display(c, row[c.key], r)])) })),
  };
}

/** A report as an HTML table, for the scheduled email. */
function toHtml(name, result) {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (col, v) => (v == null ? '' : col.type === N ? Number(v).toLocaleString('en-IN') : String(v).match(/^\d{4}-\d{2}-\d{2}T/) ? String(v).slice(0, 10) : v);
  const rows = result.rows.slice(0, 200);
  return `<h3 style="margin:16px 0 8px">${esc(name)}</h3>
  <table style="border-collapse:collapse;width:100%;max-width:760px">
    <tr>${result.columns.map((c) => `<th style="text-align:left;border-bottom:2px solid #ddd;padding:6px">${esc(c.label)}</th>`).join('')}</tr>
    ${rows.map((row) => `<tr>${result.columns.map((c) => `<td style="border-bottom:1px solid #eee;padding:6px">${esc(fmt(c, row[c.key]))}</td>`).join('')}</tr>`).join('')}
  </table>${result.rows.length > rows.length ? `<p style="color:#666">Showing 200 of ${result.rows.length} rows.</p>` : ''}`;
}

module.exports = { ENTITIES, schema, runReport, toHtml, OPS };
