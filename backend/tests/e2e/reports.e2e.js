/*
 * HTTP end-to-end checks for the report builder. RUNNING backend + THROWAWAY
 * database only. Creates its own users and leads in the default company and
 * removes them afterwards.
 *   E2E_BASE_URL (default http://localhost:7012), E2E_ROOT, E2E_ROOT_PASSWORD
 */
const bcrypt = require('bcryptjs');
const p = require('../../prismaClient');
const t = require('../../utils/tenant');

const B = process.env.E2E_BASE_URL || 'http://localhost:7012';
const ROOT = process.env.E2E_ROOT || 'admin';
const ROOT_PASSWORD = process.env.E2E_ROOT_PASSWORD || 'UiTest-Pass-123!';
const results = [];
const check = (name, ok, extra = '') => { results.push(Boolean(ok)); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const call = async (token, path, body, method = body ? 'POST' : 'GET') => {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let data = text; try { data = JSON.parse(text); } catch {}
  return { status: r.status, body: data };
};
const login = async (u, pw) => (await (await fetch(`${B}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: pw }) })).json()).token;

(async () => {
  const stamp = Date.now().toString(36);
  const made = { users: [], leads: [] };
  const inCo = (fn) => t.runWithCompany(t.DEFAULT_COMPANY_ID, fn);
  try {
    const pw = 'Report-Pass-123!';
    const hash = bcrypt.hashSync(pw, 10);
    const mgr = await inCo(() => p.user.create({ data: { username: `rmgr${stamp}`, firstName: 'Rita', lastName: 'Manager', email: 'r@x.test', password: hash, status: 'Manager', role: 'Manager', userlevel: 8 } }));
    const emp = await inCo(() => p.user.create({ data: { username: `remp${stamp}`, firstName: 'Ravi', email: 'e@x.test', password: hash, status: 'Employee', role: 'Employee', userlevel: 7 } }));
    made.users.push(mgr.id, emp.id);
    const rows = [
      ['Hot', 'Website', emp.id], ['Hot', 'Website', emp.id], ['Hot', 'Facebook', emp.id], ['Cold', 'Website', mgr.id],
    ];
    for (const [status, source, owner] of rows) {
      const l = await inCo(() => p.lead.create({ data: { name: `R ${stamp}`, mobile: '9876500000', status, primarySource: source, owner, ownerId: owner, project: 'General' } }));
      made.leads.push(l.id);
    }
    const root = await login(ROOT, ROOT_PASSWORD);
    const manager = await login(mgr.username, pw);
    const employee = await login(emp.username, pw);

    let r = await call(employee, '/api/report-builder/schema');
    check('employees cannot use the report builder', r.status === 403, r.status);
    r = await call(manager, '/api/report-builder/schema');
    check('schema lists six data sources', r.status === 200 && r.body.length === 6, r.body?.length);

    const mine = { field: 'name', op: 'eq', value: `R ${stamp}` };
    r = await call(manager, '/api/report-builder/run', { config: { entity: 'leads', columns: ['id', 'status', 'primarySource', 'ownerId'], filters: [mine] } });
    check('list report returns the matching leads', r.status === 200 && r.body.rows.length === 4, `${r.status} ${r.body?.rows?.length}`);
    check('owner ids shown as names', r.body?.rows?.some((x) => x.ownerId === 'Ravi'), JSON.stringify(r.body?.rows?.[0]));

    r = await call(manager, '/api/report-builder/run', { config: { entity: 'leads', filters: [mine], groupBy: 'status' } });
    const hot = r.body?.rows?.find((x) => x.group === 'Hot');
    check('group by status counts', r.status === 200 && hot?.count === 3, JSON.stringify(r.body?.rows));

    r = await call(manager, '/api/report-builder/run', { config: { entity: 'leads', filters: [mine, { field: 'primarySource', op: 'in', value: 'Facebook' }] } });
    check('"is one of" filter', r.body?.rows?.length === 1, r.body?.rows?.length);

    r = await call(manager, '/api/report-builder/run', { config: { entity: 'leads', filters: [mine], dateFrom: '2000-01-01', dateTo: '2000-12-31' } });
    check('date range excludes today', r.body?.rows?.length === 0, r.body?.rows?.length);

    r = await call(manager, '/api/report-builder/run', { config: { entity: 'leads', columns: ['password'] } });
    check('unknown column refused... or ignored, never returned', r.status === 400 || !JSON.stringify(r.body).includes('password":'), r.status);
    r = await call(manager, '/api/report-builder/run', { config: { entity: 'users' } });
    check('unknown data source refused', r.status === 400, r.status);
    r = await call(manager, '/api/report-builder/run', { config: { entity: 'leads', filters: [{ field: 'otherNotes', op: 'eq', value: 'x' }] } });
    check('filter on a non-reportable field refused', r.status === 400, r.status);
    r = await call(manager, '/api/report-builder/run', { config: { entity: 'bookings', groupBy: 'status', metric: { op: 'sum', field: 'agreementValue' } } });
    check('grouped sum on bookings runs', r.status === 200, r.status);

    r = await call(manager, '/api/report-builder/saved', { name: `Leads by status ${stamp}`, config: { entity: 'leads', filters: [mine], groupBy: 'status' } });
    check('report saved', r.status === 201, r.status);
    const savedId = r.body?.id;
    r = await call(manager, '/api/report-builder/saved');
    check('saved report listed', r.body?.some((x) => x.id === savedId));

    // A scheduled custom report renders the saved report as an email table.
    const html = await inCo(async () => {
      const { buildReport } = require('../../utils/scheduledReports');
      return buildReport({ name: 'Custom', type: 'custom', savedReportId: savedId, frequency: 'weekly' });
    });
    check('scheduled custom report renders the table', html.includes('Hot') && html.includes('<table'), html.length);

    r = await call(root, '/api/integrations/reports', { name: 'Weekly custom', type: 'custom', savedReportId: savedId, frequency: 'weekly', recipients: 'boss@x.test' });
    check('custom report can be scheduled', r.status === 201, r.status);

    r = await call(manager, `/api/report-builder/saved/${savedId}`, undefined, 'DELETE');
    check('deleting a saved report removes its schedule', r.status === 200 && !(await inCo(() => p.scheduledReport.findFirst({ where: { savedReportId: savedId } }))), r.status);
  } catch (error) {
    console.error(error);
    results.push(false);
  } finally {
    await inCo(async () => {
      await p.leadAssignment.deleteMany({ where: { leadId: { in: made.leads } } });
      await p.lead.deleteMany({ where: { id: { in: made.leads } } });
      const users = await p.user.findMany({ where: { id: { in: made.users } } });
      await p.session.deleteMany({ where: { username: { in: users.map((u) => u.username) } } });
      await p.systemLog.deleteMany({ where: { username: { in: users.map((u) => u.username) } } });
      await p.userAuditLog.deleteMany({ where: { userId: { in: made.users } } });
      await p.user.deleteMany({ where: { id: { in: made.users } } });
    }).catch((e) => console.error('cleanup:', e.message));
    const failed = results.filter((x) => !x).length;
    console.log(`\n${results.length - failed}/${results.length} passed; test data removed.`);
    process.exit(failed ? 1 : 0);
  }
})();
