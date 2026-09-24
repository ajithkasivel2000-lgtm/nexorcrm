/*
 * HTTP end-to-end checks for SaaS billing, self-signup and branding.
 * Needs a RUNNING backend on a THROWAWAY database, started with test Razorpay
 * secrets, e.g.:
 *   RAZORPAY_KEY_ID=rzp_test_dummy RAZORPAY_KEY_SECRET=test_key_secret_abc
 *   RAZORPAY_WEBHOOK_SECRET=test_webhook_secret_xyz PLATFORM_ADMINS=admin
 * and the same two secrets in this process's environment.
 *
 *   E2E_BASE_URL   default http://localhost:7012
 *   E2E_ROOT       a platform admin username (default admin)
 *   E2E_ROOT_PASSWORD
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const p = require('../../prismaClient');
const t = require('../../utils/tenant');

const B = process.env.E2E_BASE_URL || 'http://localhost:7012';
const ROOT = process.env.E2E_ROOT || 'admin';
const ROOT_PASSWORD = process.env.E2E_ROOT_PASSWORD || 'UiTest-Pass-123!';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'test_key_secret_abc';
const HOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook_secret_xyz';
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
const login = async (username, password) => (await call(null, '/api/auth/login', { method: 'POST', body: { username, password } })).body?.token;

(async () => {
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
    r = await call(null, '/api/public/companies', { method: 'POST', body: { companyName: `Sunrise Homes ${stamp}`, name: 'Asha', email: 'asha@sunrise.test', phone: '9876543210', username: owner, password: pw, planKey: 'starter' } });
    check('company self-signup', r.status === 201 && r.body.company?.slug, `${r.status} ${r.body?.message || ''}`);
    const slug = r.body?.company?.slug;
    r = await call(null, '/api/public/companies', { method: 'POST', body: { companyName: 'Dup', email: 'd@x.test', username: owner, password: pw } });
    check('taken username refused', r.status === 409, r.status);

    const token = await login(owner, pw);
    check('new owner signs in straight away (no forced change)', Boolean(token));
    const company = await t.runAsSystem(() => p.company.findUnique({ where: { slug } }));
    made.companyId = company.id;

    /* ---- trial & seats ---- */
    r = await call(token, '/api/billing');
    check('billing shows the free trial', r.status === 200 && r.body.status === 'trialing' && r.body.access.daysLeft === 14, `${r.body?.status} ${r.body?.access?.daysLeft}`);
    check('starter plan: 1 of 5 seats used', r.body?.seats?.used === 1 && r.body?.seats?.limit === 5, JSON.stringify(r.body?.seats));
    check('three plans on offer', r.body?.plans?.length === 3);

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

    /* ---- Razorpay: subscribe fails cleanly with test keys, checkout + webhooks ---- */
    r = await call(token, '/api/billing/subscribe', { method: 'POST', body: { planKey: 'growth' } });
    check('subscribe with dummy Razorpay keys fails with a clear error', r.status === 502 && /Razorpay/.test(r.body.message), `${r.status} ${r.body?.message}`);

    const subId = `sub_test_${stamp}`;
    await t.runAsSystem(() => p.company.update({ where: { id: company.id }, data: { razorpaySubscriptionId: subId, planKey: 'growth' } }));
    const payId = `pay_test_${stamp}`;
    r = await call(token, '/api/billing/verify', { method: 'POST', body: { paymentId: payId, subscriptionId: subId, signature: 'forged' } });
    check('forged checkout signature refused', r.status === 400, r.status);
    const sig = crypto.createHmac('sha256', KEY_SECRET).update(`${payId}|${subId}`).digest('hex');
    r = await call(token, '/api/billing/verify', { method: 'POST', body: { paymentId: payId, subscriptionId: subId, signature: sig } });
    check('genuine checkout payment activates the plan', r.status === 200 && r.body.invoice?.number, `${r.status} ${r.body?.message}`);
    check('invoice total includes 18% GST', r.body?.invoice?.totalPaise === Math.round(299900 * 1.18), r.body?.invoice?.totalPaise);

    const now = Math.floor(Date.now() / 1000);
    const event = JSON.stringify({
      event: 'subscription.charged',
      payload: {
        subscription: { entity: { id: subId, current_start: now, current_end: now + 30 * 86400 } },
        payment: { entity: { id: `pay_renew_${stamp}` } },
      },
    });
    r = await call(null, '/api/webhooks/razorpay', { method: 'POST', raw: event, headers: { 'X-Razorpay-Signature': 'bad' } });
    check('webhook with bad signature refused', r.status === 400, r.status);
    const hookSig = crypto.createHmac('sha256', HOOK_SECRET).update(event).digest('hex');
    r = await call(null, '/api/webhooks/razorpay', { method: 'POST', raw: event, headers: { 'X-Razorpay-Signature': hookSig } });
    await call(null, '/api/webhooks/razorpay', { method: 'POST', raw: event, headers: { 'X-Razorpay-Signature': hookSig } });
    await new Promise((res) => setTimeout(res, 500));
    const invoices = await t.runWithCompany(company.id, () => p.invoice.findMany());
    check('renewal webhook adds exactly one invoice (replay ignored)', r.status === 200 && invoices.length === 2, `invoices=${invoices.length}`);

    const halted = JSON.stringify({ event: 'subscription.halted', payload: { subscription: { entity: { id: subId } } } });
    await call(null, '/api/webhooks/razorpay', { method: 'POST', raw: halted, headers: { 'X-Razorpay-Signature': crypto.createHmac('sha256', HOOK_SECRET).update(halted).digest('hex') } });
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
