/*
 * HTTP end-to-end checks for SaaS billing, self-signup and branding.
 * Needs a RUNNING backend on a THROWAWAY database, started with test Cashfree
 * credentials and CASHFREE_API_URL=http://127.0.0.1:7092/pg (the fake
 * service below).
 *
 *   E2E_BASE_URL   default http://localhost:7003
 *   E2E_ROOT       a platform admin username (default admin)
 *   E2E_ROOT_PASSWORD
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const http = require('http');
const p = require('../../prismaClient');
const t = require('../../utils/tenant');

const B = process.env.E2E_BASE_URL || 'http://localhost:7003';
const ROOT = process.env.E2E_ROOT || 'admin';
const ROOT_PASSWORD = process.env.E2E_ROOT_PASSWORD || 'UiTest-Pass-123!';
const FAKE_PORT = Number(process.env.E2E_FAKE_PORT || 7092);
const SECRET_KEY = process.env.CASHFREE_SECRET_KEY || 'cashfree_test_secret';
const subscriptions = new Map();
const fakeCashfree = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    const send = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (req.method === 'POST' && req.url === '/pg/plans') return send(200, { plan_id: body.plan_id });
    if (req.method === 'POST' && req.url === '/pg/subscriptions') {
      subscriptions.set(body.subscription_id, { subscription_id: body.subscription_id, subscription_status: 'INITIALIZED' });
      return send(200, { subscription_id: body.subscription_id, subscription_session_id: `session_${Date.now()}` });
    }
    const manage = req.url.match(/^\/pg\/subscriptions\/([^/]+)\/manage$/);
    if (req.method === 'POST' && manage) {
      const subscription = subscriptions.get(decodeURIComponent(manage[1]));
      if (!subscription) return send(404, { message: 'Not found' });
      if (body.action === 'CANCEL') subscription.subscription_status = 'CANCELLED';
      return send(200, subscription);
    }
    const lookup = req.url.match(/^\/pg\/subscriptions\/([^/]+)$/);
    if (req.method === 'GET' && lookup) {
      const subscription = subscriptions.get(decodeURIComponent(lookup[1]));
      return subscription ? send(200, subscription) : send(404, { message: 'Not found' });
    }
    return send(404, { message: 'Unknown fake Cashfree route' });
  });
});
const results = [];
const check = (name, ok, extra = '') => { results.push(Boolean(ok)); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const call = async (token, path, { method = 'GET', body, headers = {}, raw } = {}) => {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const r = await fetch(B + path, { method, headers: h, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  const text = await r.text();
  let data = text; try { data = JSON.parse(text); } catch {}
  return { status: r.status, body: data, headers: r.headers };
};
const login = async (username, password, company) => (await call(null, '/api/auth/login', {
  method: 'POST',
  body: { username, password, ...(company ? { company } : {}) },
})).body?.token;

(async () => {
  await new Promise((resolve) => fakeCashfree.listen(FAKE_PORT, '127.0.0.1', resolve));
  const stamp = Date.now().toString(36);
  const made = { companyId: null };
  try {
    const root = await login(ROOT, ROOT_PASSWORD);
    check('platform admin signs in', Boolean(root));

    /* ---- self-signup ---- */
    let r = await call(null, '/api/public/companies', { method: 'POST', body: { companyName: 'Weak Co', email: 'w@x.test', username: `weak${stamp}`, password: 'short' } });
    check('weak password refused at signup', r.status === 400, r.status);
    const owner = `owner${stamp}`;
    const pw = 'Owner-Pass-123!';
    r = await call(null, '/api/public/companies', { method: 'POST', body: { companyName: `Sunrise Homes ${stamp}`, name: 'Asha', email: 'asha@sunrise.test', phone: '9876543210', username: owner, password: pw, planKey: 'starter', signupRequestKey: crypto.randomUUID() } });
    const signupCheckout = r.body?.checkout;
    check('company self-signup creates Cashfree checkout credentials', r.status === 201 && r.body.company?.slug && signupCheckout?.subscriptionId && signupCheckout?.subscriptionSessionId, `${r.status} ${r.body?.message || ''}`);
    const slug = r.body?.company?.slug;
    r = await call(null, '/api/public/companies', { method: 'POST', body: { companyName: 'Dup', email: 'd@x.test', phone: '9876543210', username: owner, password: pw } });
    check('taken username refused', r.status === 409, r.status);

    const token = await login(owner, pw, slug);
    check('new owner signs in straight away (no forced change)', Boolean(token));
    /* The signup above may have been rate-limited, in which case `slug` is
       undefined and findUnique throws a cryptic Prisma validation error from
       deep in the stack. Report it as a test failure here instead so the
       cause ("signup refused") is on the surface. */
    if (!slug) { check('company signup must succeed before billing checks', false, 'no slug — earlier signup failed'); return; }
    const company = await t.runAsSystem(() => p.company.findUnique({ where: { slug } }));
    if (!company) { check('company lookup', false, `no row for slug ${slug}`); return; }
    made.companyId = company.id;

    /* ---- trial & seats ---- */
    r = await call(token, '/api/billing');
    check('billing waits for Cashfree mandate authorization', r.status === 200 && r.body.status === 'pending_payment' && r.body.access.allowed === false, `${r.body?.status} ${r.body?.access?.allowed}`);
    check('starter plan: 1 of 5 seats used', r.body?.seats?.used === 1 && r.body?.seats?.limit === 5, JSON.stringify(r.body?.seats));
    check('three plans on offer', r.body?.plans?.length === 3);
    const subId = company.subscriptionGatewayId;
    subscriptions.set(subId, { subscription_id: subId, subscription_status: 'ACTIVE' });
    r = await call(token, '/api/billing/verify', { method: 'POST', body: { subscriptionId: subId } });
    check('verified Cashfree mandate starts the trial', r.status === 200 && r.body.startedTrial && /trial has started/.test(r.body.message), `${r.status} ${r.body?.message || ''}`);

    const h = bcrypt.hashSync('Seat-Pass-123!', 10);
    await t.runWithCompany(company.id, async () => {
      for (let i = 0; i < 4; i += 1) await p.user.create({ data: { username: `seat${i}${stamp}`, firstName: 'S', email: `s${i}@x.test`, password: h, status: 'Employee', role: 'Employee', userlevel: 7 } });
    });
    const waiting = await t.runWithCompany(company.id, () => p.user.create({ data: { username: `wait${stamp}`, firstName: 'W', email: 'w@x.test', password: h, status: 'Registered', role: 'Registered', userlevel: 0 } }));
    r = await call(token, '/api/users/activate', { method: 'POST', body: { userIds: [waiting.id] } });
    check('6th active user refused by the plan limit', r.status === 402 && r.body.code === 'PLAN_LIMIT', `${r.status} ${r.body?.message || ''}`);

    r = await call(root, `/api/platform/companies/${company.id}/billing`, { method: 'POST', body: { action: 'set-plan', planKey: 'growth' } });
    r = await call(token, '/api/users/activate', { method: 'POST', body: { userIds: [waiting.id] } });
    check('after upgrade to Growth the user can be activated', r.status === 200, r.status);
    const perms = await t.runWithCompany(company.id, () => p.userPermission.count({ where: { userId: waiting.id } }));
    check('activation gives the Employee role default permissions', perms > 0, `rows=${perms}`);

    /* ---- expiry locks everything but billing ---- */
    await call(root, `/api/platform/companies/${company.id}/billing`, { method: 'POST', body: { action: 'expire' } });
    r = await call(token, '/api/leads');
    check('expired company: CRM refused with 402', r.status === 402 && r.body.code === 'SUBSCRIPTION_INACTIVE', r.status);
    r = await call(token, '/api/billing');
    check('expired company: billing still opens', r.status === 200 && r.body.access.allowed === false, r.status);
    r = await call(root, `/api/platform/companies/${company.id}/billing`, { method: 'POST', body: { action: 'extend-trial', days: 7 } });
    check('platform extends the trial', r.status === 200, r.body?.message);
    r = await call(token, '/api/leads');
    check('extended trial: CRM opens again', r.status === 200, r.status);

    /* ---- Cashfree subscription checkout and webhooks ---- */
    r = await call(token, '/api/billing/subscribe', { method: 'POST', body: { planKey: 'growth' } });
    check('re-authorizing an active subscription is refused', r.status === 409, `${r.status} ${r.body?.message || ''}`);
    check('signup returns subscription checkout credentials', Boolean(signupCheckout?.subscriptionId && signupCheckout?.subscriptionSessionId && signupCheckout?.mode));

    const event = JSON.stringify({
      type: 'SUBSCRIPTION_PAYMENT_SUCCESS',
      data: { subscription_id: subId, cf_payment_id: `pay_first_${stamp}`, payment_initiated_date: new Date().toISOString() },
      event_time: new Date().toISOString(),
    });
    const timestamp = String(Date.now());
    const webhookHeaders = (signature) => ({ 'x-webhook-signature': signature, 'x-webhook-timestamp': timestamp });
    r = await call(null, '/api/webhooks/cashfree', { method: 'POST', raw: event, headers: webhookHeaders('bad') });
    check('webhook with bad signature refused', r.status === 400, r.status);
    const hookSig = crypto.createHmac('sha256', SECRET_KEY).update(`${timestamp}${event}`).digest('base64');
    r = await call(null, '/api/webhooks/cashfree', { method: 'POST', raw: event, headers: webhookHeaders(hookSig) });
    await call(null, '/api/webhooks/cashfree', { method: 'POST', raw: event, headers: webhookHeaders(hookSig) });
    await new Promise((res) => setTimeout(res, 500));
    const invoices = await t.runWithCompany(company.id, () => p.invoice.findMany());
    check('payment webhook adds one GST invoice (replay ignored)', r.status === 200 && invoices.length === 1 && invoices[0].totalPaise === Math.round(99900 * 1.18), `invoices=${invoices.length}`);

    const halted = JSON.stringify({ type: 'SUBSCRIPTION_PAYMENT_FAILED', data: { subscription_id: subId } });
    const failedSig = crypto.createHmac('sha256', SECRET_KEY).update(`${timestamp}${halted}`).digest('base64');
    await call(null, '/api/webhooks/cashfree', { method: 'POST', raw: halted, headers: webhookHeaders(failedSig) });
    await new Promise((res) => setTimeout(res, 300));
    r = await call(token, '/api/billing');
    check('failed renewal → past due with grace period', r.body?.status === 'past_due' && r.body?.access?.allowed === true, `${r.body?.status}`);

    /* ---- platform plans ---- */
    r = await call(token, '/api/platform/plans');
    check('company admin cannot manage plans', r.status === 403, r.status);
    r = await call(root, '/api/platform/plans', { method: 'POST', body: { key: `test${stamp}`, name: 'Test plan', priceRupees: 1499, maxUsers: 10 } });
    check('platform admin creates a plan', r.status === 201 && r.body.pricePaise === 149900, r.status);
    const planId = r.body?.id;
    r = await call(root, `/api/platform/plans/${planId}`, { method: 'PUT', body: { priceRupees: 1999, active: false } });
    check('platform admin edits a plan', r.status === 200 && r.body.pricePaise === 199900 && r.body.active === false, r.status);
    await t.runAsSystem(() => p.plan.delete({ where: { id: planId } }));

    /* ---- branding ---- */
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    r = await call(token, '/api/company/branding', { method: 'PUT', body: { brandColor: '#0F766E', logoDataUrl: png } });
    check('branding saved', r.status === 200 && r.body.brandColor === '#0F766E' && r.body.logoUrl, r.status);
    r = await call(null, `/api/public/branding?company=${slug}`);
    check('public branding by slug for the login page', r.status === 200 && r.body.name.startsWith('Sunrise') && r.body.logoUrl, r.status);
    const logo = await call(null, r.body.logoUrl.split('?')[0]);
    check('logo is served as an image', logo.status === 200 && logo.headers.get('content-type') === 'image/png', logo.status);
    r = await call(token, '/api/company/branding', { method: 'PUT', body: { brandColor: 'red' } });
    check('bad colour refused', r.status === 400, r.status);
  } catch (error) {
    console.error(error);
    results.push(false);
  } finally {
    fakeCashfree.close();
    if (made.companyId) {
      await t.runWithCompany(made.companyId, async () => {
        const c = await t.runAsSystem(() => p.company.findUnique({ where: { id: made.companyId } }));
        if (c?.logoKey) await require('../../utils/storage').remove(c.logoKey);
        for (const m of ['invoice', 'session', 'systemLog', 'userAuditLog', 'userPermission', 'leadStatus', 'callStatus', 'primarySource', 'secondarySource', 'rRQType', 'projectStatus', 'projectType', 'department', 'emailTemplate', 'user']) {
          await p[m].deleteMany({}).catch(() => {});
        }
      });
      await t.runAsSystem(() => p.company.delete({ where: { id: made.companyId } }));
    }
    const failed = results.filter((x) => !x).length;
    console.log(`\n${results.length - failed}/${results.length} passed; test company removed.`);
    process.exit(failed ? 1 : 0);
  }
})();
