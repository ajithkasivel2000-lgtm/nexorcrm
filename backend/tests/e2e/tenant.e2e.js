/*
 * HTTP end-to-end checks against a RUNNING backend and a THROWAWAY database.
 * Never point these at production: they create and delete test data.
 *
 *   E2E_BASE_URL   default http://localhost:7003
 *   E2E_EMPLOYEE / E2E_MANAGER / E2E_ADMIN / E2E_ROOT   existing usernames of
 *     those roles in the default company (E2E_ROOT must be in PLATFORM_ADMINS)
 *   E2E_LEAD       a lead id owned by someone other than E2E_EMPLOYEE
 */
const p = require('../../prismaClient');
const t = require('../../utils/tenant');
const B = process.env.E2E_BASE_URL || 'http://localhost:7003';
const U = { employee: process.env.E2E_EMPLOYEE || 'kumar', manager: process.env.E2E_MANAGER || 'ajith', admin: process.env.E2E_ADMIN || 'subodh', root: process.env.E2E_ROOT || 'admin' };
const LEAD = process.env.E2E_LEAD || 'LED-2026-001';
const TAG = 'e2e-test';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

const mk = (username, companyId = t.DEFAULT_COMPANY_ID) => t.runWithCompany(companyId, () => p.session.create({
  data: { username, ipAddress: '127.0.0.1', userAgent: TAG, persistent: false, expiry: new Date(Date.now() + 600000) },
}));
const call = async (sess, path, opts = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (sess) headers.Authorization = `Bearer ${typeof sess === 'string' ? sess : `sess_${sess.id}`}`;
  const r = await fetch(B + path, { ...opts, headers });
  let body = null; try { body = await r.json(); } catch {}
  return { status: r.status, body };
};

(async () => {
  const created = { companyId: null };
  try {
    const emp = await mk(U.employee); const mgr = await mk(U.manager); const adm = await mk(U.admin); const root = await mk(U.root);

    // --- access control (regression of the earlier fixes)
    let r = await call(emp, '/api/sessions'); check('employee cannot list sessions', r.status === 403, r.status);
    r = await call(mgr, '/api/sessions'); check('manager sees session handles only', r.status === 200 && r.body.every((s) => s.id.startsWith('sh_')), r.status);
    r = await call(emp, '/api/settings/mail'); check('employee cannot read mail settings', r.status === 403, r.status);
    r = await call(adm, '/api/settings/mail'); check('admin mail settings hide password', r.status === 200 && r.body.smtpPassword === '', r.status);
    r = await call(emp, `/api/leads/${LEAD}`); check('employee cannot open unowned lead', r.status === 404, r.status);
    r = await call(adm, `/api/leads/${LEAD}`); check('admin opens lead', r.status === 200, r.status);
    r = await call(adm, '/api/leads'); check('admin lists leads', r.status === 200 && Array.isArray(r.body) && r.body.length === 1, `${r.status} n=${r.body?.length}`);
    r = await call(adm, '/api/dashboard'); check('dashboard loads', r.status === 200, r.status);
    r = await call(adm, '/api/company'); check('company endpoint gives public key', r.status === 200 && r.body.publicKey?.length > 10, r.status);
    const defaultKey = r.body?.publicKey;

    // --- platform: only platform admins
    r = await call(adm, '/api/platform/companies'); check('company admin is not platform admin', r.status === 403, r.status);
    r = await call(root, '/api/platform/companies'); check('platform admin lists companies', r.status === 200 && r.body.length >= 1, r.status);

    const slug = `acme-${Date.now().toString(36)}`;
    r = await call(root, '/api/platform/companies', { method: 'POST', body: JSON.stringify({
      name: 'Acme Realty', slug, admin: { username: `acmeboss_${slug.slice(-5)}`, email: 'boss@acme.test', password: 'Acme-Pass-123!', firstName: 'Acme' },
    }) });
    check('platform admin creates company', r.status === 201 && r.body.company?.id, `${r.status} ${r.body?.message || ''}`);
    created.companyId = r.body?.company?.id;
    const acmeAdmin = r.body?.admin?.username;

    // --- the new company's admin logs in with a password (full login path)
    r = await call(null, '/api/auth/login', { method: 'POST', body: JSON.stringify({ username: acmeAdmin, password: 'Acme-Pass-123!' }) });
    check('new company admin can log in', r.status === 200 && r.body.token, `${r.status} ${r.body?.message || ''}`);
    check('session token is 256 random bits, not a counter', /^sess_[0-9a-f]{64}$/.test(r.body?.token || ''), r.body?.token?.slice(0, 16));
    const guessed = await call('sess_SES-2026-001', '/api/leads'); check('a guessed old-style token is refused', guessed.status === 401, guessed.status);
    const acme = r.body?.token;

    r = await call(acme, '/api/leads'); check('new company sees no leads of the other', r.status === 200 && r.body.length === 0, `n=${r.body?.length}`);
    r = await call(acme, '/api/users'); check('new company sees only its own user', r.status === 200 && r.body.length === 1, `n=${r.body?.length}`);
    r = await call(acme, `/api/leads/${LEAD}`); check("new company cannot open the other company's lead", r.status === 404, r.status);
    r = await call(acme, '/api/lead-statuses'); check('new company got default lead statuses', r.status === 200 && r.body.length >= 5, `n=${r.body?.length}`);
    r = await call(acme, '/api/departments'); check('new company got default departments', r.status === 200 && r.body.length === 6, `n=${r.body?.length}`);

    // --- public lead form with each company's key lands in the right company
    r = await call(acme, '/api/company'); const acmeKey = r.body?.publicKey;
    r = await call(null, '/api/public/leads', { method: 'POST', headers: { 'X-Company-Key': acmeKey }, body: JSON.stringify({ name: 'Web Buyer', mobile: '9876543210', project: 'General' }) });
    check('website lead accepted with company key', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    r = await call(null, '/api/public/leads', { method: 'POST', body: JSON.stringify({ name: 'x', mobile: '9876543210' }) });
    check('website lead without key refused', r.status === 400, r.status);
    r = await call(acme, '/api/leads'); check('lead is in the new company', r.body?.length === 1, `n=${r.body?.length}`);
    r = await call(adm, '/api/leads'); check('original company still has only its lead', r.body?.length === 1, `n=${r.body?.length}`);
    check('keys differ between companies', defaultKey && acmeKey && defaultKey !== acmeKey);

    // --- suspending a company locks it out
    r = await call(root, `/api/platform/companies/${created.companyId}`, { method: 'PUT', body: JSON.stringify({ status: 'Suspended' }) });
    check('platform admin suspends company', r.status === 200, r.status);
    r = await call(acme, '/api/leads'); check('suspended company is locked out (signed out)', r.status === 401, r.status);
  } catch (error) {
    console.error(error);
    results.push(false);
  } finally {
    await t.runAsSystem(() => p.session.deleteMany({ where: { userAgent: TAG } }));
    if (created.companyId) {
      // Remove every row the test company made, then the company.
      await t.runWithCompany(created.companyId, async () => {
        for (const m of ['leadLog', 'leadAssignment', 'notification', 'lead', 'session', 'systemLog', 'userAuditLog', 'leadStatus', 'callStatus', 'primarySource', 'secondarySource', 'rRQType', 'projectStatus', 'projectType', 'department', 'emailTemplate', 'emailOutbox', 'leadAssignmentSetting', 'user']) {
          await p[m].deleteMany({}).catch((e) => console.log('cleanup', m, e.message.slice(0, 80)));
        }
      });
      await t.runAsSystem(() => p.company.delete({ where: { id: created.companyId } }));
    }
    const failed = results.filter((x) => !x).length;
    console.log(`\n${results.length - failed}/${results.length} passed; test company removed.`);
    process.exit(failed ? 1 : 0);
  }
})();
