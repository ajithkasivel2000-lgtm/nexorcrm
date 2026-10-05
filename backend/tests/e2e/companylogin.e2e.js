/*
 * HTTP end-to-end checks for company sign-in: a company's own sign-in (the
 * Company Login tab's company code, its ?company= link, or its own domain)
 * lets only that company's accounts in.
 *
 * Needs a RUNNING backend on a THROWAWAY database (APP_URL=https://os.nexorcrm.test),
 * and this process pointed at the same database (DATABASE_URL).
 *
 *   E2E_BASE_URL   default http://localhost:7003
 *   E2E_ROOT / E2E_ROOT_PASSWORD   the platform admin (default admin / UiTest-Pass-123!)
 */
const http = require('http');
const p = require('../../prismaClient');
const t = require('../../utils/tenant');
const { provisionCompany } = require('../../utils/provisioning');

const B = process.env.E2E_BASE_URL || 'http://localhost:7003';
const ROOT = process.env.E2E_ROOT || 'admin';
const ROOT_PASSWORD = process.env.E2E_ROOT_PASSWORD || 'UiTest-Pass-123!';
const results = [];
const check = (name, ok, extra = '') => { results.push(Boolean(ok)); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

/* POST /api/auth/login, optionally as if opened on another address. */
const login = (body, host) => new Promise((resolve, reject) => {
  const u = new URL(`${B}/api/auth/login`);
  const data = JSON.stringify(body);
  const req = http.request({
    hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...(host ? { Host: host } : {}) },
  }, (res) => {
    let text = '';
    res.on('data', (c) => { text += c; });
    res.on('end', () => { let json = {}; try { json = JSON.parse(text); } catch {} resolve({ status: res.statusCode, body: json }); });
  });
  req.on('error', reject);
  req.end(data);
});

(async () => {
  const stamp = Date.now().toString(36);
  const made = [];
  const pw = 'Company-Pass-123!';
  const sharedEmail = `shared-${stamp}@example.test`;
  try {
    const mk = async (name) => {
      const r = await t.runAsSystem(() => provisionCompany({ name: `${name} ${stamp}`, planKey: 'growth', admin: { username: `${name.toLowerCase()}${stamp}`, email: sharedEmail, firstName: name, password: pw, mustChangePassword: false } }));
      made.push(r.company.id);
      return r;
    };
    const a = await mk('Roof');
    const b = await mk('Land');
    await t.runAsSystem(() => p.company.update({ where: { id: a.company.id }, data: { customDomain: `crm.roof-${stamp}.example` } }));
    const ua = a.admin.username;

    let r = await login({ username: ua, password: pw });
    check('platform sign-in refuses company users without their company link', r.status === 401 && !r.body.token, r.status);
    r = await login({ username: ua, password: pw, company: a.company.slug });
    check('Company Login with own company code: signed in', Boolean(r.body.token), r.status);
    r = await login({ username: ua, password: pw, company: b.company.slug });
    check('...with another company\'s code: refused like a wrong password', r.status === 401 && !r.body.token && r.body.message === 'Invalid credentials', `${r.status} ${r.body.message}`);
    r = await login({ username: ua, password: pw, company: 'no-such-company' });
    check('unknown company code: says so', r.status === 400 && /company code/.test(r.body.message), `${r.status} ${r.body.message}`);
    r = await login({ username: ua, password: pw, company: a.company.slug.toUpperCase() });
    check('company code is not case-sensitive', Boolean(r.body.token), r.status);

    r = await login({ username: sharedEmail, password: pw });
    check('platform sign-in refuses an email belonging to a client company', r.status === 401, r.status);
    r = await login({ username: sharedEmail, password: pw, company: b.company.slug });
    check('...but on a company\'s sign-in the email is enough', Boolean(r.body.token) && r.body.user?.username === b.admin.username, `${r.status} ${r.body.user?.username}`);

    r = await login({ username: ua, password: pw }, `crm.roof-${stamp}.example`);
    check('on its own domain, its people sign in', Boolean(r.body.token), r.status);
    r = await login({ username: b.admin.username, password: pw }, `crm.roof-${stamp}.example`);
    check('on its own domain, another company\'s people cannot', r.status === 401 && !r.body.token, r.status);
    r = await login({ username: ROOT, password: ROOT_PASSWORD }, `crm.roof-${stamp}.example`);
    check('the platform owner cannot sign in on a client\'s page', r.status === 401 && !r.body.token, r.status);

    const failed = await t.runWithCompany(b.company.id, () => p.user.findUnique({ where: { id: b.admin.id } }));
    check('a refused cross-company attempt does not count towards lockout', (failed.user_login_attempts || 0) === 0, failed.user_login_attempts);
  } catch (error) {
    console.error(error);
    check('suite ran without throwing', false, error.message);
  } finally {
    for (const id of made) {
      await t.runWithCompany(id, async () => {
        for (const m of ['session', 'systemLog', 'userAuditLog', 'userStatusHistory', 'leadStatus', 'callStatus', 'primarySource', 'secondarySource', 'tertiarySource', 'rRQType', 'projectStatus', 'projectType', 'department', 'emailTemplate', 'emailOutbox', 'leadAssignmentSetting', 'openReason', 'leadType', 'user']) {
          if (p[m]) await p[m].deleteMany({}).catch(() => {});
        }
      }).catch(() => {});
      await t.runAsSystem(() => p.company.delete({ where: { id } })).catch((e) => console.error('cleanup:', e.message.slice(0, 120)));
    }
    const failedCount = results.filter((x) => !x).length;
    console.log(`\n${results.length - failedCount}/${results.length} passed`);
    process.exit(failedCount ? 1 : 0);
  }
})();
