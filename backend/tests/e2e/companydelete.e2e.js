/*
 * HTTP end-to-end checks for Platform → Companies → Delete Selected:
 * a suspended client company is removed with ALL of its data, and nothing
 * else is touched.
 *
 * Needs a RUNNING backend on a THROWAWAY database (PLATFORM_ADMINS=admin),
 * and this process pointed at the same database (DATABASE_URL).
 *
 *   E2E_BASE_URL   default http://localhost:7003
 *   E2E_ROOT       a platform admin in the default company (default admin)
 *   E2E_ADMIN      a company admin who is NOT a platform admin (default subodh)
 */
const { Prisma } = require('@prisma/client');
const p = require('../../prismaClient');
const t = require('../../utils/tenant');
const { provisionCompany } = require('../../utils/provisioning');

const B = process.env.E2E_BASE_URL || 'http://localhost:7003';
const ROOT = process.env.E2E_ROOT || 'admin';
const ADMIN = process.env.E2E_ADMIN || 'subodh';
const CO = t.DEFAULT_COMPANY_ID;
const TAG = 'e2e-companydelete';
const results = [];
const check = (name, ok, extra = '') => { results.push(Boolean(ok)); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const lower = (n) => n.charAt(0).toLowerCase() + n.slice(1);
const TENANT_MODELS = Prisma.dmmf.datamodel.models.filter((m) => m.fields.some((f) => f.name === 'companyId')).map((m) => lower(m.name));

const call = async (sessId, path, { method = 'GET', body } = {}) => {
  const r = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(sessId ? { Authorization: `Bearer sess_${sessId}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = text; try { data = JSON.parse(text); } catch {}
  return { status: r.status, body: data };
};

/* Rows the company owns, in every tenant table. */
const rowsOf = (companyId) => t.runAsSystem(async () => {
  let total = 0;
  for (const m of TENANT_MODELS) total += await p[m].count({ where: { companyId } });
  return total;
});

(async () => {
  const stamp = Date.now().toString(36);
  let victim = null;
  try {
    const mk = (username) => t.runWithCompany(CO, () => p.session.create({ data: { username, ipAddress: '127.0.0.1', userAgent: TAG, persistent: false, expiry: new Date(Date.now() + 600000) } }));
    const root = (await mk(ROOT)).id;
    const admin = (await mk(ADMIN)).id;
    const ownBefore = await rowsOf(CO);

    // A client company with real data in it: a lead, a project, a booking with
    // its plan and a payment, a document, a sign-in.
    const made = await t.runAsSystem(() => provisionCompany({ name: `Gone Homes ${stamp}`, planKey: 'growth', admin: { username: `gone${stamp}`, email: `gone${stamp}@example.test`, firstName: 'Gone', password: 'Gone-Pass-123!' } }));
    victim = made.company;
    await t.runWithCompany(victim.id, async () => {
      await p.lead.create({ data: { name: 'Doomed Lead', mobile: '9876500001', status: 'New Lead', owner: made.admin.id, ownerId: made.admin.id, logs: { create: { title: 'created', actor: made.admin.username } } } });
      const project = await p.project.create({ data: { projectName: `Doomed Towers ${stamp}`, status: 'Active' } });
      const unit = await p.projectUnit.create({ data: { projectId: project.id, unitNumber: 'Z-1', status: 'Booked' } });
      await p.booking.create({ data: {
        projectId: project.id, unitId: unit.id, buyerName: 'Doomed Buyer', agreementValue: 100000,
        milestones: { create: [{ name: 'All', amount: 100000 }] },
        payments: { create: [{ amount: 1000, mode: 'UPI' }] },
      } });
      await p.document.create({ data: { entityType: 'project', entityId: project.id, fileName: 'x.txt', storedName: `e2e-${stamp}-missing.txt` } });
      await p.session.create({ data: { username: made.admin.username, ipAddress: '127.0.0.1', userAgent: TAG, persistent: false, expiry: new Date(Date.now() + 600000) } });
    });
    const before = await rowsOf(victim.id);
    check('the client company has data across many tables', before > 20, `${before} rows`);

    let r = await call(admin, '/api/platform/companies/bulk-delete', { method: 'POST', body: { ids: [victim.id] } });
    check('a company admin cannot delete companies', r.status === 403, r.status);
    r = await call(root, '/api/platform/companies/bulk-delete', { method: 'POST', body: { ids: [CO] } });
    check('the owner company can never be deleted', r.status === 400, `${r.status} ${r.body?.message}`);
    r = await call(root, '/api/platform/companies/bulk-delete', { method: 'POST', body: { ids: [] } });
    check('nothing chosen: refused', r.status === 400, r.status);
    r = await call(root, '/api/platform/companies/bulk-delete', { method: 'POST', body: { ids: [victim.id] } });
    check('an active company must be suspended first', r.status === 400 && /Suspend/.test(r.body?.message), `${r.status} ${r.body?.message}`);
    check('...and nothing was deleted', await rowsOf(victim.id) === before);

    r = await call(root, `/api/platform/companies/${victim.id}`, { method: 'PUT', body: { status: 'Suspended' } });
    check('company suspended', r.status === 200, r.status);
    r = await call(root, '/api/platform/companies/bulk-delete', { method: 'POST', body: { ids: [victim.id] } });
    check('suspended company deleted', r.status === 200 && r.body?.removed?.company === 1, `${r.status} ${r.body?.message}`);
    check('every row it owned is gone, in every table', await rowsOf(victim.id) === 0);
    const company = await t.runAsSystem(() => p.company.findUnique({ where: { id: victim.id } }));
    check('the company itself is gone', company === null);
    // Username is composite-unique per company now; cross-tenant lookup is a
    // findFirst, not findUnique.
    const takenAgain = await t.runAsSystem(() => p.user.findFirst({ where: { username: `gone${stamp}` } }));
    check('its usernames are free again', takenAgain === null);
    // Counted after this test's own sessions were made; background jobs may only add rows.
    check('the owner company\'s data is untouched', await rowsOf(CO) >= ownBefore, `${await rowsOf(CO)} vs ${ownBefore}`);
    r = await call(root, '/api/platform/companies/bulk-delete', { method: 'POST', body: { ids: [victim.id] } });
    check('deleting it again: not found', r.status === 404, r.status);
    victim = null;
  } catch (error) {
    console.error(error);
    check('suite ran without throwing', false, error.message);
  } finally {
    await t.runAsSystem(() => p.session.deleteMany({ where: { userAgent: TAG } })).catch(() => {});
    if (victim) await require('../../utils/companyDelete').deleteCompanies([victim.id]).catch((e) => console.error('cleanup:', e.message));
    const failed = results.filter((x) => !x).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
  }
})();
