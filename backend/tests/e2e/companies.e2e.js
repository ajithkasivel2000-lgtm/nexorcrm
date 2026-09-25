/*
 * HTTP end-to-end checks for Platform → Companies → View / Edit: a client
 * company's details and its administrators' logins, as seen and changed by
 * the platform owner.
 *
 * Needs a RUNNING backend on a THROWAWAY database (PLATFORM_ADMINS=admin),
 * and this process pointed at the same database (DATABASE_URL).
 *
 *   E2E_BASE_URL   default http://localhost:7003
 *   E2E_ROOT       a platform admin in the default company (default admin)
 *   E2E_ADMIN      a company admin who is NOT a platform admin (default subodh)
 */
const p = require('../../prismaClient');
const t = require('../../utils/tenant');

const B = process.env.E2E_BASE_URL || 'http://localhost:7003';
const ROOT = process.env.E2E_ROOT || 'admin';
const ADMIN = process.env.E2E_ADMIN || 'subodh';
const CO = t.DEFAULT_COMPANY_ID;
const TAG = 'e2e-companies';
const results = [];
const check = (name, ok, extra = '') => { results.push(Boolean(ok)); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

const call = async (sessId, path, { method = 'GET', body } = {}) => {
  const r = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(sessId ? { Authorization: `Bearer sess_${sessId}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = text; try { data = JSON.parse(text); } catch {}
  return { status: r.status, body: data, text };
};
const login = (username, password) => call(null, '/api/auth/login', { method: 'POST', body: { username, password } });

(async () => {
  const stamp = Date.now().toString(36);
  const made = { companyId: null };
  try {
    const mk = (username) => t.runWithCompany(CO, () => p.session.create({ data: { username, ipAddress: '127.0.0.1', userAgent: TAG, persistent: false, expiry: new Date(Date.now() + 600000) } }));
    const root = (await mk(ROOT)).id;
    const admin = (await mk(ADMIN)).id;

    const first = { username: `lm${stamp}`, email: `owner-${stamp}@example.test`, firstName: 'Lata', password: 'First-Pass-123!' };
    let r = await call(root, '/api/platform/companies', { method: 'POST', body: { name: `Landmint ${stamp}`, planKey: 'growth', admin: first } });
    check('company created', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const company = r.body.company;
    made.companyId = company.id;

    /* ---- view ---- */
    r = await call(root, `/api/platform/companies/${company.id}/details`);
    const a = r.body?.admins?.[0];
    check('owner views the company and its admin login', r.status === 200 && a?.username === first.username && a.email === first.email && a.mustChangePassword === true && a.lastLoginAt === null, r.status);
    check('...with its sign-in address and counts', r.body?.signInUrl?.includes(`company=${company.slug}`) && r.body.counts.users === 1);
    check('no password or hash is ever sent', !/"password"|\$2[aby]\$/.test(r.text) && !('totpSecret' in (a || {})));
    r = await call(admin, `/api/platform/companies/${company.id}/details`);
    check('a company admin cannot view other companies', r.status === 403, r.status);
    r = await call(root, `/api/platform/companies/${CO}/details`);
    check('the owner company is managed from User Admin, not here', r.status === 400, r.status);
    r = await call(root, '/api/platform/companies/CMP-NOPE/details');
    check('unknown company: 404', r.status === 404, r.status);

    /* ---- edit company ---- */
    r = await call(root, `/api/platform/companies/${company.id}/details`, { method: 'PUT', body: { gstin: 'short' } });
    check('bad GSTIN refused', r.status === 400, r.status);
    r = await call(root, `/api/platform/companies/${company.id}/details`, { method: 'PUT', body: { name: '' } });
    check('blank name refused', r.status === 400, r.status);
    r = await call(root, `/api/platform/companies/${company.id}/details`, { method: 'PUT', body: { name: `Landmint Realty ${stamp}`, legalName: 'Landmint Realty Pvt Ltd', gstin: '29abcde1234f1z5', phone: '9876543210', billingEmail: 'accounts@example.test', billingAddress: 'MG Road' } });
    check('company details saved', r.status === 200 && r.body.legalName === 'Landmint Realty Pvt Ltd' && r.body.gstin === '29ABCDE1234F1Z5', r.status);

    /* ---- edit admin ---- */
    const base = `/api/platform/companies/${company.id}/admins/${a.id}`;
    r = await call(root, base, { method: 'PUT', body: { email: 'not-an-email' } });
    check('bad admin email refused', r.status === 400, r.status);
    r = await call(root, base, { method: 'PUT', body: { username: ROOT } });
    check('a username taken elsewhere is refused', r.status === 409, r.status);
    const oldToken = (await login(first.username, first.password)).body?.token;
    check('admin can sign in before the change', Boolean(oldToken));
    const renamed = `${first.username}x`;
    r = await call(root, base, { method: 'PUT', body: { username: renamed, email: `new-${stamp}@example.test`, lastName: 'Rao' } });
    check('admin username and email changed', r.status === 200 && r.body.username === renamed && r.body.email === `new-${stamp}@example.test`, `${r.status} ${r.body?.message || ''}`);
    r = await fetch(`${B}/api/notifications`, { headers: { Authorization: `Bearer ${oldToken}` } });
    check('renaming signs the old session out', r.status === 401, r.status);
    const subodh = await t.runWithCompany(CO, () => p.user.findFirst({ where: { username: ADMIN } }));
    r = await call(root, `/api/platform/companies/${company.id}/admins/${subodh.id}`, { method: 'PUT', body: { firstName: 'Hacked' } });
    check('a user of another company cannot be edited through it', r.status === 404, r.status);

    /* ---- reset password ---- */
    r = await call(root, `${base}/reset-password`, { method: 'POST', body: { password: 'weakpass' } });
    check('weak temporary password refused', r.status === 400, r.status);
    const fresh = 'Temp-Pass-456!';
    r = await call(root, `${base}/reset-password`, { method: 'POST', body: { password: fresh } });
    check('temporary password set', r.status === 200, `${r.status} ${r.body?.message || ''}`);
    r = await login(renamed, first.password);
    check('old password no longer works', !r.body?.token, r.status);
    r = await login(renamed, fresh);
    check('new temporary password works, flagged for change', Boolean(r.body?.token) && r.body.mustChangePassword === true, `${r.status} ${r.body?.message || ''}`);
    const after = await t.runWithCompany(company.id, () => p.user.findUnique({ where: { id: a.id } }));
    check('they must choose their own at next sign-in', after.forcePasswordChange === true);
    const audit = await t.runWithCompany(company.id, () => p.userAuditLog.findMany({ where: { userId: a.id } }));
    check('changes are in the user\'s audit log', audit.some((x) => x.action === 'password_reset') && audit.some((x) => x.field === 'username'), audit.map((x) => x.action + ':' + (x.field || '')).join(','));
    r = await call(admin, `${base}/reset-password`, { method: 'POST', body: { password: 'Other-Pass-789!' } });
    check('a company admin cannot reset other companies\' passwords', r.status === 403, r.status);
  } catch (error) {
    console.error(error);
    check('suite ran without throwing', false, error.message);
  } finally {
    await t.runAsSystem(() => p.session.deleteMany({ where: { userAgent: TAG } })).catch(() => {});
    if (made.companyId) {
      await t.runWithCompany(made.companyId, async () => {
        for (const m of ['session', 'systemLog', 'userAuditLog', 'userStatusHistory', 'leadStatus', 'callStatus', 'primarySource', 'secondarySource', 'tertiarySource', 'rRQType', 'projectStatus', 'projectType', 'department', 'emailTemplate', 'emailOutbox', 'leadAssignmentSetting', 'openReason', 'leadType', 'user']) {
          if (p[m]) await p[m].deleteMany({}).catch((e) => console.log('cleanup', m, e.message.slice(0, 80)));
        }
      });
      await t.runAsSystem(() => p.company.delete({ where: { id: made.companyId } })).catch((e) => console.error('cleanup company:', e.message.slice(0, 200)));
    }
    const failed = results.filter((x) => !x).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
  }
})();
