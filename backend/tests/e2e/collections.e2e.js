/*
 * HTTP end-to-end checks for the buyer portal, online payments from buyers
 * (Cashfree payment links) and payment reminders.
 *
 * Needs a RUNNING backend on a THROWAWAY database, started with
 *   CASHFREE_API_URL=http://127.0.0.1:7091/pg   (this script plays Cashfree there)
 * and this process pointed at the same database (DATABASE_URL).
 *
 *   E2E_BASE_URL   default http://localhost:7003
 *   E2E_ADMIN      an administrator in the default company (default subodh)
 *   E2E_FAKE_PORT  default 7091
 */
const crypto = require('crypto');
const http = require('http');
const p = require('../../prismaClient');
const t = require('../../utils/tenant');

const B = process.env.E2E_BASE_URL || 'http://localhost:7003';
const ADMIN = process.env.E2E_ADMIN || 'subodh';
const FAKE_PORT = Number(process.env.E2E_FAKE_PORT || 7091);
const CO = t.DEFAULT_COMPANY_ID;
const APP_ID = 'cashfree_test_buyer';
const SECRET_KEY = 'buyer_secret_key';
const HOOK_SECRET = SECRET_KEY;
const DAY = 86400000;

const results = [];
const check = (name, ok, extra = '') => { results.push(Boolean(ok)); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const inCo = (fn) => t.runWithCompany(CO, fn);
const call = async (auth, path, { method = 'GET', body, headers = {}, raw } = {}) => {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (auth?.staff) h.Authorization = `Bearer sess_${auth.staff}`;
  if (auth?.buyer) h['X-Buyer-Token'] = auth.buyer;
  const r = await fetch(B + path, { method, headers: h, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  const text = await r.text();
  let data = text; try { data = JSON.parse(text); } catch {}
  return { status: r.status, body: data };
};

/* A stand-in for Cashfree's payment-links API. */
const fake = { requests: [], n: 0 };
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const parsed = body ? JSON.parse(body) : {};
    fake.requests.push({
      method: req.method, url: req.url, auth: req.headers.authorization,
      appId: req.headers['x-client-id'], secretKey: req.headers['x-client-secret'],
      apiVersion: req.headers['x-api-version'], body: parsed,
    });
    if (req.method === 'POST' && req.url === '/pg/links') {
      fake.n += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ link_id: parsed.link_id, link_url: `https://payments-test.cashfree.com/links/e2e${fake.n}`, link_amount: parsed.link_amount, link_status: 'ACTIVE' }));
    }
    res.writeHead(404); return res.end('{}');
  });
});

const signed = (payload, secret = HOOK_SECRET) => {
  const raw = JSON.stringify(payload);
  const timestamp = String(Date.now());
  return { raw, headers: {
    'x-webhook-timestamp': timestamp,
    'x-webhook-signature': crypto.createHmac('sha256', secret).update(`${timestamp}${raw}`).digest('base64'),
  } };
};

(async () => {
  await new Promise((r) => server.listen(FAKE_PORT, '127.0.0.1', r));
  const stamp = Date.now().toString(36);
  const email = `buyer-${stamp}@example.test`;
  const made = { projectId: null, bookingId: null, docIds: [], sessionIds: [] };
  try {
    const sess = await inCo(() => p.session.create({ data: { username: ADMIN, ipAddress: '127.0.0.1', userAgent: 'e2e-test', persistent: false, expiry: new Date(Date.now() + 600000) } }));
    made.sessionIds.push(sess.id);
    const adm = { staff: sess.id };

    /* ---- a booking with one overdue and one upcoming milestone ---- */
    const project = await inCo(() => p.project.create({ data: { projectName: `E2E Buyer Towers ${stamp}`, status: 'Active' } }));
    made.projectId = project.id;
    const unit = await inCo(() => p.projectUnit.create({ data: { projectId: project.id, unitNumber: 'B-202', status: 'Available', price: 2000000 } }));
    let r = await call(adm, '/api/bookings', { method: 'POST', body: {
      projectId: project.id, unitId: unit.id, buyerName: 'Priya Buyer', buyerEmail: email.toUpperCase(), buyerMobile: '9876500000',
      agreementValue: 2000000, plan: 'custom',
      steps: [{ name: 'On booking', percent: 10, dueDate: new Date(Date.now() - DAY) }, { name: 'On agreement', percent: 90, dueDate: new Date(Date.now() + 7 * DAY) }],
    } });
    check('booking created', r.status === 201 && r.body.id, `${r.status} ${r.body?.message || ''}`);
    const bookingId = r.body.id;
    made.bookingId = bookingId;
    const first = r.body.summary.milestones[0];

    /* ---- online payments are off until the company connects Cashfree ---- */
    r = await call(adm, `/api/bookings/${bookingId}/payment-links`);
    check('payment links listed, online off', r.status === 200 && r.body.online === false && r.body.links.length === 0, r.status);
    r = await call(adm, `/api/bookings/${bookingId}/payment-links`, { method: 'POST', body: {} });
    check('payment link refused before Cashfree is set up', r.status === 400 && /not set up/.test(r.body.message), r.status);
    r = await call(adm, '/api/integrations/buyer-payments', { method: 'PUT', body: { gateway: { enabled: true, appId: APP_ID } } });
    check('turning on without a secret is refused', r.status === 400, r.status);
    r = await call(adm, '/api/integrations/buyer-payments', { method: 'PUT', body: { gateway: { enabled: true, appId: APP_ID, secretKey: SECRET_KEY } } });
    check('gateway saved; secret never sent back', r.status === 200 && r.body.gateway.secretKey === '' && r.body.gateway.secretKeySet, r.status);
    check('webhook URL names the company', String(r.body.webhookUrl).endsWith(`/api/webhooks/cashfree-payments/${CO}`), r.body.webhookUrl);

    /* ---- staff create a payment link ---- */
    r = await call(adm, `/api/bookings/${bookingId}/payment-links`, { method: 'POST', body: {} });
    const link = r.body;
    const sent = fake.requests.at(-1);
    check('payment link created for the next due milestone', r.status === 201 && link.shortUrl?.startsWith('https://payments-test.cashfree.com/') && Number(link.amount) === first.outstanding, `${r.status} ${r.body?.message || ''}`);
    check('Cashfree called with company credentials, amount and notes',
      sent?.appId === APP_ID && sent?.secretKey === SECRET_KEY && sent.apiVersion && sent.body.link_amount === first.outstanding && sent.body.link_notes.bookingId === bookingId && sent.body.link_meta.return_url.includes('/portal?company='));
    r = await call(adm, `/api/bookings/${bookingId}/payment-links`, { method: 'POST', body: {} });
    check('an open link is reused, not duplicated', r.status === 201 && r.body.id === link.id, r.body?.id);
    r = await call(adm, `/api/bookings/${bookingId}/payment-links`, { method: 'POST', body: { amount: 99999999 } });
    check('more than the balance is refused', r.status === 400, r.status);

    /* ---- buyer portal sign-in ---- */
    r = await call(adm, `/api/bookings/${bookingId}/portal-link`, { method: 'POST' });
    const loginToken = new URL(r.body.url).searchParams.get('token');
    check('staff get a portal link for the buyer', r.status === 200 && /^[a-f0-9]{64}$/.test(loginToken || ''), r.status);
    const stored = await inCo(() => p.buyerLoginToken.findFirst({ where: { email }, orderBy: { createdAt: 'desc' } }));
    check('login token stored hashed, not in the clear', stored && stored.tokenHash !== loginToken && stored.tokenHash.length === 64);
    r = await call(null, '/api/buyer/sign-in', { method: 'POST', body: { token: loginToken } });
    const buyer = { buyer: r.body.token };
    made.sessionIds.push(r.body.token);
    check('buyer signs in with the link', r.status === 200 && /^[a-f0-9]{64}$/.test(r.body.token || '') && r.body.email === email, r.status);
    r = await call(null, '/api/buyer/sign-in', { method: 'POST', body: { token: loginToken } });
    check('the link works only once', r.status === 401, r.status);

    r = await call(null, '/api/buyer/request-link', { method: 'POST', body: { company: 'default', email: `nobody-${stamp}@example.test` } });
    const unknownTokens = await inCo(() => p.buyerLoginToken.count({ where: { email: `nobody-${stamp}@example.test` } }));
    const slug = (await t.runAsSystem(() => p.company.findUnique({ where: { id: CO } }))).slug;
    const r2 = await call(null, '/api/buyer/request-link', { method: 'POST', body: { company: slug, email } });
    const knownTokens = await inCo(() => p.buyerLoginToken.count({ where: { email, createdBy: 'buyer' } }));
    check('emailed link: same answer whether or not the email is known', r.status === 200 && r2.status === 200 && r.body.message === r2.body.message, `${r.status} ${r2.status}`);
    check('...but a link is only made for a real buyer', unknownTokens === 0 && knownTokens === 1, `${unknownTokens} ${knownTokens}`);

    /* ---- what the buyer sees ---- */
    r = await call(buyer, '/api/buyer/me');
    const mine = r.body?.bookings?.[0];
    check('buyer sees their booking (email matched case-insensitively)', r.status === 200 && r.body.bookings.length === 1 && mine.id === bookingId && r.body.onlinePayments === true, r.status);
    check('...with the payment plan and the open link', mine?.summary.milestones.length === 2 && mine.openLinks.length === 1, JSON.stringify(mine?.openLinks));
    r = await call(null, '/api/buyer/me');
    check('portal refuses without a token', r.status === 401, r.status);
    r = await call({ buyer: crypto.randomBytes(32).toString('hex') }, '/api/buyer/me');
    check('portal refuses a made-up token', r.status === 401, r.status);
    r = await call(buyer, '/api/bookings');
    check('a buyer token is not a staff sign-in', r.status === 401, r.status);

    r = await call(buyer, `/api/buyer/bookings/${bookingId}/pay`, { method: 'POST', body: { milestoneId: first.id } });
    check('buyer pays a milestone: gets the Cashfree link', r.status === 200 && r.body.shortUrl === link.shortUrl, r.status);
    r = await call(buyer, '/api/buyer/bookings/BKG-0000-999/pay', { method: 'POST', body: {} });
    check('buyer cannot pay someone else\'s booking', r.status === 404, r.status);

    /* ---- documents shared with the buyer ---- */
    const dataUrl = `data:text/plain;base64,${Buffer.from('allotment letter').toString('base64')}`;
    r = await call(adm, `/api/records/booking/${bookingId}/documents/upload`, { method: 'POST', body: { fileName: 'allotment.txt', category: 'Agreement', dataUrl } });
    const docId = r.body?.id;
    if (docId) made.docIds.push(docId);
    check('staff attach a document to the booking', r.status === 201 && docId, `${r.status} ${r.body?.message || ''}`);
    r = await call(adm, `/api/records/project/${project.id}/documents/upload`, { method: 'POST', body: { fileName: 'internal.txt', dataUrl } });
    if (r.body?.id) made.docIds.push(r.body.id);
    const otherDoc = r.body?.id;
    const dl = await fetch(`${B}/api/buyer/documents/${docId}`, { headers: { 'X-Buyer-Token': buyer.buyer } });
    check('buyer downloads a booking document', dl.status === 200 && (await dl.text()) === 'allotment letter', dl.status);
    r = await call(buyer, `/api/buyer/documents/${otherDoc}`);
    check('buyer cannot download other documents', r.status === 404, r.status);

    /* ---- Cashfree reports the payment ---- */
    const paidEvent = {
      type: 'PAYMENT_LINK_EVENT',
      data: { link_id: link.gatewayLinkId, link_amount_paid: first.outstanding, link_status: 'PAID', cf_payment_id: `pay_e2e_${stamp}`, payment_group: 'upi' },
    };
    let s = signed(paidEvent, 'wrong-secret');
    r = await call(null, `/api/webhooks/cashfree-payments/${CO}`, { method: 'POST', raw: s.raw, headers: s.headers });
    check('webhook with a bad signature is refused', r.status === 401, r.status);
    s = signed(paidEvent);
    r = await call(null, `/api/webhooks/cashfree-payments/${CO}`, { method: 'POST', raw: s.raw, headers: s.headers });
    check('signed payment_link.paid accepted', r.status === 200, r.status);
    r = await call(null, `/api/webhooks/cashfree-payments/${CO}`, { method: 'POST', raw: s.raw, headers: s.headers });
    check('replayed webhook accepted', r.status === 200, r.status);
    const payments = await inCo(() => p.payment.findMany({ where: { bookingId } }));
    check('payment recorded exactly once', payments.length === 1 && Number(payments[0].amount) === first.outstanding && payments[0].gatewayPaymentId === `pay_e2e_${stamp}` && /Online/.test(payments[0].mode), JSON.stringify(payments.map((x) => [x.amount, x.mode])));
    /* An earlier failure in this suite can leave link.id undefined, in which
       case findUnique throws a cryptic Prisma validation error. Report the
       state we have instead, so the FAIL points at the real cause. */
    if (!link?.id) { check('link marked paid', false, 'no link id — earlier payment-link step failed'); return; }
    const linkAfter = await inCo(() => p.paymentLink.findUnique({ where: { id: link.id } }));
    check('link marked paid', linkAfter?.status === 'paid' && linkAfter?.paymentId === `pay_e2e_${stamp}`, linkAfter?.status);
    r = await call(null, '/api/webhooks/cashfree-payments/CMP-NOPE', { method: 'POST', raw: s.raw, headers: s.headers });
    check('webhook for an unknown company is refused', r.status === 404, r.status);
    r = await call(buyer, '/api/buyer/me');
    check('buyer sees the receipt', r.body.bookings[0].payments.length === 1 && r.body.bookings[0].summary.milestones[0].outstanding === 0, r.status);

    /* ---- reminders ---- */
    r = await call(adm, '/api/integrations/buyer-payments', { method: 'PUT', body: { reminders: { enabled: true, daysBefore: [7, 1, 500, 'x'], overdueEveryDays: 7, maxOverdue: 2, email: true, whatsapp: false } } });
    check('reminder settings saved, bad days dropped', r.status === 200 && JSON.stringify(r.body.reminders.daysBefore) === '[7,1]', JSON.stringify(r.body?.reminders?.daysBefore));
    r = await call(adm, '/api/integrations/buyer-payments', { method: 'PUT', body: { reminders: { whatsapp: true, whatsappTemplate: '' } } });
    check('WhatsApp reminders need a template', r.status === 400, r.status);
    const { runCollectionReminders } = require('../../utils/collections');
    const at = new Date(); at.setHours(11, 0, 0, 0);
    await inCo(() => runCollectionReminders({ now: at, force: true }));
    await inCo(() => runCollectionReminders({ now: at, force: true }));
    const logs = await inCo(() => p.collectionReminderLog.findMany({ where: { bookingId } }));
    check('the upcoming milestone gets its 7-day reminder, once', logs.length === 1 && logs[0].slot === 'before-7' && logs[0].channel === 'email', JSON.stringify(logs.map((l) => [l.slot, l.status])));
    const night = new Date(at); night.setHours(23);
    const quiet = await inCo(() => runCollectionReminders({ now: night }));
    check('no reminders at night', quiet.sent === 0);
    r = await call(adm, '/api/integrations/buyer-payments/reminders');
    check('reminder log visible to admins', r.status === 200 && r.body.some((l) => l.bookingId === bookingId), r.status);

    /* ---- a cancelled booking leaves the portal ---- */
    r = await call(adm, `/api/bookings/${bookingId}/cancel`, { method: 'POST', body: { reason: 'e2e' } });
    r = await call(buyer, '/api/buyer/me');
    check('cancelled booking no longer shown', r.status === 200 && r.body.bookings.length === 0, r.body?.bookings?.length);
    r = await call(buyer, '/api/buyer/sign-out', { method: 'POST' });
    r = await call(buyer, '/api/buyer/me');
    check('signed out', r.status === 401, r.status);
  } catch (error) {
    console.error(error);
    check('suite ran without throwing', false, error.message);
  } finally {
    await inCo(async () => {
      if (made.docIds.length) {
        const docs = await p.document.findMany({ where: { id: { in: made.docIds } } });
        for (const d of docs) await require('../../utils/storage').remove(d.storedName).catch(() => {});
        await p.document.deleteMany({ where: { id: { in: made.docIds } } });
      }
      if (made.bookingId) {
        await p.collectionReminderLog.deleteMany({ where: { bookingId: made.bookingId } });
        await p.paymentLink.deleteMany({ where: { bookingId: made.bookingId } });
        await p.booking.deleteMany({ where: { id: made.bookingId } });
      }
      await p.buyerLoginToken.deleteMany({ where: { email: { endsWith: `${stamp}@example.test` } } });
      await p.buyerSession.deleteMany({ where: { email: { endsWith: `${stamp}@example.test` } } });
      await p.session.deleteMany({ where: { id: { in: made.sessionIds } } });
      await p.paymentGatewaySetting.deleteMany({});
      await p.collectionReminderSetting.deleteMany({});
      if (made.projectId) {
        await p.projectUnit.deleteMany({ where: { projectId: made.projectId } });
        await p.project.delete({ where: { id: made.projectId } });
      }
    }).catch((e) => console.error('cleanup:', e.message));
    server.close();
    const failed = results.filter((x) => !x).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
  }
})();
