/*
 * HTTP end-to-end checks for client companies on their own domain
 * (crm.roofonwalls.com): the platform owner sets it, the app recognises the
 * company from the address, and links point there.
 *
 * Needs a RUNNING backend on a THROWAWAY database, started with
 *   APP_URL=https://os.nexorcrm.test   PLATFORM_ADMINS=admin
 * and this process given the same APP_URL and database (DATABASE_URL).
 *
 *   E2E_BASE_URL   default http://localhost:7003
 *   E2E_ROOT       a platform admin in the default company (default admin)
 *   E2E_ADMIN      a company admin who is NOT a platform admin (default subodh)
 */
const crypto = require('crypto');
const http = require('http');
const p = require('../../prismaClient');
const t = require('../../utils/tenant');

const B = process.env.E2E_BASE_URL || 'http://localhost:7003';
const ROOT = process.env.E2E_ROOT || 'admin';
const ADMIN = process.env.E2E_ADMIN || 'subodh';
const CO = t.DEFAULT_COMPANY_ID;
const TAG = 'e2e-domains';
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
  return { status: r.status, body: data };
};

/* fetch() will not send a made-up Host header; http.request will. */
const asHost = (host, path) => new Promise((resolve, reject) => {
  const u = new URL(B + path);
  const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers: { Host: host } }, (res) => {
    let body = '';
    res.on('data', (c) => { body += c; });
    res.on('end', () => { let data = body; try { data = JSON.parse(body); } catch {} resolve({ status: res.statusCode, body: data }); });
  });
  req.on('error', reject);
  req.end();
});

(async () => {
  const stamp = Date.now().toString(36);
  const domain = `crm.${stamp}-homes.example`;
  const made = [];
  try {
    const mk = (username) => t.runWithCompany(CO, () => p.session.create({ data: { username, ipAddress: '127.0.0.1', userAgent: TAG, persistent: false, expiry: new Date(Date.now() + 600000) } }));
    const root = (await mk(ROOT)).id;
    const admin = (await mk(ADMIN)).id;
    const newCo = (name) => t.runAsSystem(() => p.company.create({ data: { name, slug: `${stamp}-${name.toLowerCase().replace(/\W+/g, '-')}`, publicKey: crypto.randomBytes(16).toString('hex'), status: 'Active' } }));
    const a = await newCo('Sunrise Homes'); made.push(a.id);
    const b = await newCo('Other Realty'); made.push(b.id);

    let r = await call(root, `/api/platform/companies/${a.id}`, { method: 'PUT', body: { customDomain: `https://${domain.toUpperCase()}/login` } });
    check('platform owner sets a domain; it is normalised', r.status === 200 && r.body.customDomain === domain, `${r.status} ${r.body?.customDomain || r.body?.message}`);
    r = await call(root, `/api/platform/companies/${b.id}`, { method: 'PUT', body: { customDomain: domain } });
    check('two companies cannot share a domain', r.status === 409, r.status);
    for (const bad of ['os.nexorcrm.test', 'nexorcrm.test', 'localhost', '10.1.2.3']) {
      r = await call(root, `/api/platform/companies/${b.id}`, { method: 'PUT', body: { customDomain: bad } });
      check(`refused: ${bad}`, r.status === 400, r.status);
    }
    r = await call(admin, `/api/platform/companies/${a.id}`, { method: 'PUT', body: { customDomain: 'crm.hijack.example' } });
    check('a company admin cannot set domains', r.status === 403, r.status);

    r = await asHost(domain, '/api/public/branding');
    check('opened on its domain, the app knows the company', r.status === 200 && r.body?.slug === a.slug && r.body?.name === 'Sunrise Homes', JSON.stringify(r.body));
    r = await asHost(domain.toUpperCase(), '/api/public/branding');
    check('...whatever the case of the address', r.body?.slug === a.slug);
    r = await asHost('os.nexorcrm.test', '/api/public/branding');
    check('the platform address shows no company', r.status === 200 && r.body === null, JSON.stringify(r.body));
    r = await asHost('crm.unknown.example', '/api/public/branding');
    check('an unknown address shows no company', r.body === null);
    r = await asHost(domain, `/api/public/branding?company=${b.slug}`);
    check('?company= still wins when given', r.body?.slug === b.slug);

    const { companyBaseUrl } = require('../../utils/companyUrl');
    check('links for that company use its domain', await companyBaseUrl(a.id) === `https://${domain}`);
    check('other companies keep the platform address', await companyBaseUrl(b.id) === 'https://os.nexorcrm.test', await companyBaseUrl(b.id));

    await t.runAsSystem(() => p.company.update({ where: { id: a.id }, data: { status: 'Suspended' } }));
    r = await asHost(domain, '/api/public/branding');
    check('a suspended company is not shown on its domain', r.body === null);

    r = await call(root, `/api/platform/companies/${a.id}`, { method: 'PUT', body: { customDomain: '' } });
    check('domain removed', r.status === 200 && r.body.customDomain === null, r.status);
  } catch (error) {
    console.error(error);
    check('suite ran without throwing', false, error.message);
  } finally {
    await t.runAsSystem(async () => {
      await p.session.deleteMany({ where: { userAgent: TAG } });
      await p.company.deleteMany({ where: { id: { in: made } } });
    }).catch((e) => console.error('cleanup:', e.message));
    const failed = results.filter((x) => !x).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
  }
})();
