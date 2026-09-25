/*
 * HTTP end-to-end checks against a RUNNING backend and a THROWAWAY database.
 * Never point these at production: they create and delete test data.
 *
 *   E2E_BASE_URL   default http://localhost:7012
 *   E2E_EMPLOYEE / E2E_MANAGER / E2E_ADMIN / E2E_ROOT   existing usernames of
 *     those roles in the default company (E2E_ROOT must be in PLATFORM_ADMINS)
 *   E2E_LEAD       a lead id owned by someone other than E2E_EMPLOYEE
 */
const bcrypt = require('bcryptjs');
const { io } = require('../../../frontend/node_modules/socket.io-client');
const p = require('../../prismaClient');
const t = require('../../utils/tenant');
const { codeAt } = require('../../utils/totp');
const B = process.env.E2E_BASE_URL || 'http://localhost:7012';
const U = { employee: process.env.E2E_EMPLOYEE || 'kumar', manager: process.env.E2E_MANAGER || 'ajith', admin: process.env.E2E_ADMIN || 'subodh', root: process.env.E2E_ROOT || 'admin' };
const LEAD = process.env.E2E_LEAD || 'LED-2026-001';
const TAG = 'e2e-test';
const CO = t.DEFAULT_COMPANY_ID;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const inCo = (fn) => t.runWithCompany(CO, fn);
const mk = (username) => inCo(() => p.session.create({ data: { username, ipAddress: '127.0.0.1', userAgent: TAG, persistent: false, expiry: new Date(Date.now() + 600000) } }));
const call = async (sess, path, opts = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (sess) headers.Authorization = `Bearer ${typeof sess === 'string' ? sess : `sess_${sess.id}`}`;
  const r = await fetch(B + path, { ...opts, headers });
  const text = await r.text();
  let body = text; try { body = JSON.parse(text); } catch {}
  return { status: r.status, body, headers: r.headers };
};
const made = { projectId: null, users: [], integrationId: null, partnerId: null, leadIds: [], docIds: [] };

(async () => {
  try {
    const adm = await mk(U.admin); const emp = await mk(U.employee);
    // The employee holds the Employee role's default permissions, as an activated account does.
    const empUser = await inCo(() => p.user.findFirst({ where: { username: U.employee } }));
    await call(adm, `/api/user-permissions/${empUser.id}/apply-role-defaults`, { method: 'POST', body: '{}' });

    /* ---------------- bookings & payments ---------------- */
    const project = await inCo(() => p.project.create({ data: { projectName: `E2E Towers ${Date.now()}`, status: 'Active', gstPercent: 5 } }));
    made.projectId = project.id;
    const unit = await inCo(() => p.projectUnit.create({ data: { projectId: project.id, unitNumber: 'A-101', status: 'Available', price: 5000000 } }));

    let r = await call(adm, '/api/bookings/plans'); check('payment plans listed', r.status === 200 && r.body.length === 3, r.status);
    r = await call(adm, '/api/bookings', { method: 'POST', body: JSON.stringify({
      projectId: project.id, unitId: unit.id, buyerName: 'Ravi Kumar', buyerMobile: '9876500001',
      agreementValue: 5000000, bookingAmount: 500000, bookingAmountPaid: true, paymentMode: 'NEFT', plan: 'down-payment',
      steps: [{ name: 'On booking', percent: 10, dueDate: new Date(Date.now() - 86400000 * 5) }, { name: 'Within 45 days', percent: 90, dueDate: new Date(Date.now() - 86400000) }],
    }) });
    check('unit booked', r.status === 201 && r.body.summary.paid === 500000, `${r.status} ${r.body?.message || ''}`);
    const bookingId = r.body?.id;
    check('milestones add up to agreement value', r.body?.milestones?.reduce((s, m) => s + Number(m.amount), 0) === 5000000);
    check('overdue computed (second step past due)', r.body?.summary?.overdue === 4500000, r.body?.summary?.overdue);
    r = await call(adm, '/api/bookings', { method: 'POST', body: JSON.stringify({ projectId: project.id, unitId: unit.id, buyerName: 'Someone Else', agreementValue: 100 }) });
    check('same unit cannot be booked twice', r.status === 409, r.status);
    const unitAfter = await inCo(() => p.projectUnit.findUnique({ where: { id: unit.id } }));
    check('unit marked Booked', unitAfter.status === 'Booked');
    r = await call(adm, `/api/bookings/${bookingId}/payments`, { method: 'POST', body: JSON.stringify({ amount: 1000000, mode: 'Cheque' }) });
    check('payment recorded', r.status === 201 && r.body.summary.paid === 1500000 && r.body.summary.overdue === 3500000, r.body?.summary?.overdue);
    r = await call(adm, `/api/bookings/${bookingId}/payments`, { method: 'POST', body: JSON.stringify({ amount: 99999999 }) });
    check('overpayment refused', r.status === 400, r.status);
    r = await call(adm, '/api/bookings/collections'); check('collections shows overdue', r.status === 200 && r.body.overdueTotal >= 3500000, r.body?.overdueTotal);
    r = await call(emp, `/api/bookings/${bookingId}/cancel`, { method: 'POST', body: '{}' });
    check('employee cannot cancel (view only)', r.status === 403, r.status);
    r = await call(adm, `/api/bookings/${bookingId}`); check('booking detail has cost-sheet project fields', r.status === 200 && 'gstPercent' in (r.body.project || {}), r.status);
    r = await call(adm, `/api/bookings/${bookingId}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'test' }) });
    const unitFreed = await inCo(() => p.projectUnit.findUnique({ where: { id: unit.id } }));
    check('cancel releases the unit', r.status === 200 && unitFreed.status === 'Available', unitFreed.status);

    /* ---------------- two-factor sign-in ---------------- */
    const pw = 'E2e-Strong-Pass-1!';
    const u2 = await inCo(() => p.user.create({ data: { username: `e2e2fa_${Date.now().toString(36)}`, firstName: 'Two', email: 'twofa@e2e.test', password: bcrypt.hashSync(pw, 10), status: 'Employee', role: 'Employee', userlevel: 7 } }));
    made.users.push(u2.id);
    r = await call(null, '/api/auth/login', { method: 'POST', body: JSON.stringify({ username: u2.username, password: pw }) });
    const s2 = r.body?.token;
    r = await call(s2, '/api/auth/2fa/setup', { method: 'POST' });
    check('2fa setup gives secret + otpauth uri', r.status === 200 && r.body.otpauthUri?.startsWith('otpauth://'), r.status);
    const secret = r.body?.secret;
    r = await call(s2, '/api/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code: '000000' === codeAt(secret) ? '111111' : '000000' }) });
    check('2fa enable refuses wrong code', r.status === 400, r.status);
    r = await call(s2, '/api/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code: codeAt(secret) }) });
    check('2fa enabled with 10 recovery codes', r.status === 200 && r.body.recoveryCodes?.length === 10, r.status);
    const recovery = r.body?.recoveryCodes?.[0];
    r = await call(null, '/api/auth/login', { method: 'POST', body: JSON.stringify({ username: u2.username, password: pw }) });
    check('password step asks for the code, no token yet', r.status === 200 && r.body.twoFactorRequired && !r.body.token, JSON.stringify(Object.keys(r.body)));
    const challenge = r.body?.challenge;
    r = await call(null, '/api/auth/2fa/verify', { method: 'POST', body: JSON.stringify({ challenge, code: '123456' === codeAt(secret) ? '654321' : '123456' }) });
    check('wrong 2fa code refused', r.status === 401, r.status);
    r = await call(null, '/api/auth/2fa/verify', { method: 'POST', body: JSON.stringify({ challenge, code: codeAt(secret) }) });
    check('right 2fa code signs in', r.status === 200 && r.body.token, r.status);
    r = await call(null, '/api/auth/2fa/verify', { method: 'POST', body: JSON.stringify({ challenge, code: recovery }) });
    check('recovery code signs in', r.status === 200 && r.body.token, r.status);
    r = await call(null, '/api/auth/2fa/verify', { method: 'POST', body: JSON.stringify({ challenge, code: recovery }) });
    check('recovery code works only once', r.status === 401, r.status);
    r = await call(adm, `/api/users/${u2.id}`);
    check('user API never returns the 2fa secret', r.status === 200 && !('totpSecret' in r.body) && r.body.twoFactorEnabled === true, r.status);

    /* ---------------- calendar feed ---------------- */
    r = await call(adm, '/api/calendar/link'); check('calendar link issued', r.status === 200 && /\/api\/calendar\/feed\/[0-9a-f]{48}\.ics$/.test(r.body.url), r.body?.url);
    const feedPath = new URL(r.body.url).pathname;
    r = await call(null, feedPath); check('calendar feed is valid iCalendar', r.status === 200 && String(r.body).startsWith('BEGIN:VCALENDAR') && r.headers.get('content-type').includes('text/calendar'), r.status);
    r = await call(null, '/api/calendar/feed/' + 'a'.repeat(48) + '.ics'); check('unknown calendar token 404', r.status === 404, r.status);

    /* ---------------- integrations ---------------- */
    r = await call(emp, '/api/integrations/whatsapp'); check('employee cannot open integrations', r.status === 403, r.status);
    r = await call(adm, '/api/integrations/whatsapp', { method: 'PUT', body: JSON.stringify({ phoneNumberId: '1234567890', accessToken: 'secret-token-x' }) });
    check('whatsapp settings saved, token hidden', r.status === 200 && r.body.accessToken === '' && r.body.accessTokenSet === true && r.body.verifyToken, r.status);
    r = await call(adm, '/api/integrations/whatsapp', { method: 'PUT', body: JSON.stringify({ accessToken: '' }) });
    check('blank token keeps stored one', r.body?.accessTokenSet === true);
    r = await call(adm, '/api/integrations/lead-sources', { method: 'POST', body: JSON.stringify({ provider: 'google', name: 'E2E Google form', primarySource: 'Digital Marketing' }) });
    check('google lead source created with key', r.status === 201 && r.body.webhookKey?.length > 20, r.status);
    made.integrationId = r.body?.id; const gkey = r.body?.webhookKey;
    r = await call(null, `/api/webhooks/google-leads/${gkey}`, { method: 'POST', body: JSON.stringify({ google_key: 'wrong', user_column_data: [] }) });
    check('google webhook with wrong key refused', r.status === 403, r.status);
    r = await call(null, `/api/webhooks/google-leads/${gkey}`, { method: 'POST', body: JSON.stringify({
      google_key: gkey, lead_id: 'g1', campaign_id: 'c1', form_id: 'f1',
      user_column_data: [{ column_id: 'FULL_NAME', string_value: 'Google Buyer' }, { column_id: 'PHONE_NUMBER', string_value: '+91 98765 00002' }, { column_id: 'EMAIL', string_value: 'g@buyer.test' }],
    }) });
    check('google lead created through intake', r.status === 200 && r.body.leadId, `${r.status} ${JSON.stringify(r.body)}`);
    if (r.body?.leadId) made.leadIds.push(r.body.leadId);
    r = await call(null, '/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42');
    check('meta verify with bad token 403', r.status === 403, r.status);
    const wa = await inCo(() => p.whatsAppSetting.findFirst());
    r = await call(null, `/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=${wa.verifyToken}&hub.challenge=42`);
    check('meta verify with company token echoes challenge', r.status === 200 && String(r.body) === '42', r.status);
    r = await call(null, '/api/webhooks/meta', { method: 'POST', headers: { 'X-Hub-Signature-256': 'sha256=forged' }, body: JSON.stringify({
      object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '1234567890' }, messages: [{ id: 'wamid.FORGED', from: '919876500002', type: 'text', text: { body: 'forged' } }] } }] }],
    }) });
    await new Promise((res) => setTimeout(res, 300));
    const forged = await inCo(() => p.whatsAppMessage.findFirst({ where: { waMessageId: 'wamid.FORGED' } }));
    check('unsigned WhatsApp webhook ignored', r.status === 200 && !forged);

    /* ---------------- channel partner portal ---------------- */
    const cp = await inCo(() => p.channelPartner.create({ data: {
      typeOfChannelPartner: 'Individual', message: '-', companyName: 'E2E Realtors', websiteUrl: '-', ownerName: 'Partner Pat',
      mobileNumber: '9876500003', emailAddress: 'pat@e2e.test', reraRegistrationNumber: 'RERA1', status: 'Active', leadOwner: U.admin,
    } }));
    made.partnerId = cp.id;
    const pname = `e2epartner_${Date.now().toString(36)}`;
    r = await call(emp, `/api/partner-accounts/${cp.id}`, { method: 'POST', body: JSON.stringify({ username: pname, email: 'pat@e2e.test', password: 'Partner-Pass-1!' }) });
    check('employee cannot create partner logins', r.status === 403, r.status);
    r = await call(adm, `/api/partner-accounts/${cp.id}`, { method: 'POST', body: JSON.stringify({ username: pname, email: 'pat@e2e.test', password: 'Partner-Pass-1!' }) });
    check('admin creates partner login', r.status === 201, r.status);
    if (r.body?.id) made.users.push(r.body.id);
    r = await call(null, '/api/auth/login', { method: 'POST', body: JSON.stringify({ username: pname, password: 'Partner-Pass-1!' }) });
    const ps = r.body?.token; check('partner can sign in', Boolean(ps), r.status);
    r = await call(ps, '/api/leads'); check('partner walled off from CRM leads (signed out)', r.status === 401, r.status);
    r = await call(ps, '/api/opportunities'); check('partner walled off from opportunities (signed out)', r.status === 401, r.status);
    r = await call(ps, '/api/partner/leads', { method: 'POST', body: JSON.stringify({ name: 'Partner Lead', mobile: '9876500004', project: project.projectName }) });
    check('partner submits a lead', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    if (r.body?.id) made.leadIds.push(r.body.id);
    r = await call(ps, '/api/partner/leads'); check('partner sees own lead, number masked', r.status === 200 && r.body.length === 1 && r.body[0].mobile.includes('••'), JSON.stringify(r.body?.[0]?.mobile));
    r = await call(ps, '/api/partner/me'); check('partner summary', r.status === 200 && r.body.leads === 1, r.status);

    /* ---------------- documents ---------------- */
    const leadId = made.leadIds[0];
    const dataUrl = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 e2e test file').toString('base64')}`;
    r = await call(adm, `/api/records/lead/${leadId}/documents/upload`, { method: 'POST', body: JSON.stringify({ fileName: 'agreement.pdf', dataUrl, category: 'Agreement' }) });
    check('document uploaded', r.status === 201 && r.body.size > 0, `${r.status} ${r.body?.message || ''}`);
    const docId = r.body?.id; if (docId) made.docIds.push(docId);
    r = await call(adm, `/api/documents/${docId}/download`); check('document downloads with same bytes', r.status === 200 && String(r.body).startsWith('%PDF-1.4 e2e'), r.status);
    r = await call(emp, `/api/documents/${docId}/download`); check("employee cannot download another's lead document", r.status === 404, r.status);
    r = await call(emp, `/api/records/lead/${leadId}/notes`); check("employee cannot read another's lead notes", r.status === 404, r.status);
    r = await call(adm, `/api/records/lead/${leadId}/documents/upload`, { method: 'POST', body: JSON.stringify({ fileName: 'x.exe', dataUrl: 'data:application/x-msdownload;base64,TVo=' }) });
    check('executable upload refused', r.status === 400, r.status);

    /* ---------------- realtime ---------------- */
    const got = await new Promise((resolve) => {
      const sock = io(B, { path: '/socket.io', auth: { token: `sess_${emp.id}` }, transports: ['websocket'] });
      const timer = setTimeout(() => { sock.close(); resolve(null); }, 5000);
      sock.on('connect', async () => {
        sock.on('data:changed', (msg) => { clearTimeout(timer); sock.close(); resolve(msg); });
        await call(adm, '/api/departments', { method: 'POST', body: JSON.stringify({ name: `E2E Dept ${Date.now()}` }) });
      });
      sock.on('connect_error', () => { clearTimeout(timer); resolve('connect_error'); });
    });
    check('colleague gets live data:changed over socket', got && got.resource === 'departments', JSON.stringify(got));
    const bad = await new Promise((resolve) => {
      const sock = io(B, { path: '/socket.io', auth: { token: 'sess_not-a-real-session-id' }, transports: ['websocket'] });
      sock.on('connect', () => { sock.close(); resolve('connected'); });
      sock.on('connect_error', (e) => { sock.close(); resolve(e.message); });
    });
    check('socket refuses a bad token', bad === 'unauthorised', bad);

    r = await call(null, '/api/health'); check('health endpoint', r.status === 200 && r.body.ok === true, r.status);
  } catch (error) {
    console.error(error);
    results.push(false);
  } finally {
    await inCo(async () => {
      if (made.docIds.length) {
        const docs = await p.document.findMany({ where: { id: { in: made.docIds } } });
        for (const d of docs) await require('../../utils/storage').remove(d.storedName);
        await p.document.deleteMany({ where: { id: { in: made.docIds } } });
      }
      await p.department.deleteMany({ where: { name: { startsWith: 'E2E Dept' } } });
      if (made.leadIds.length) {
        await p.leadAssignment.deleteMany({ where: { leadId: { in: made.leadIds } } });
        await p.notification.deleteMany({ where: { url: { in: made.leadIds.map((id) => `/leads/${id}`) } } }).catch(() => {});
        await p.lead.deleteMany({ where: { id: { in: made.leadIds } } });
      }
      if (made.integrationId) await p.leadIntegration.deleteMany({ where: { id: made.integrationId } });
      await p.whatsAppSetting.deleteMany({});
      await p.booking.deleteMany({ where: { projectId: made.projectId || '-' } });
      if (made.projectId) { await p.projectUnit.deleteMany({ where: { projectId: made.projectId } }); await p.project.delete({ where: { id: made.projectId } }); }
      if (made.users.length) {
        const us = await p.user.findMany({ where: { id: { in: made.users } } });
        await p.session.deleteMany({ where: { username: { in: us.map((u) => u.username) } } });
        await p.userAuditLog.deleteMany({ where: { userId: { in: made.users } } });
        await p.systemLog.deleteMany({ where: { username: { in: us.map((u) => u.username) } } });
        await p.user.deleteMany({ where: { id: { in: made.users } } });
      }
      if (made.partnerId) await p.channelPartner.delete({ where: { id: made.partnerId } });
      const subodh = await p.user.findFirst({ where: { username: U.admin } });
      if (subodh) await p.user.update({ where: { id: subodh.id }, data: { calendarToken: null } });
      await p.session.deleteMany({ where: { userAgent: TAG } });
    }).catch((e) => console.error('cleanup:', e.message));
    const failed = results.filter((x) => !x).length;
    console.log(`\n${results.length - failed}/${results.length} passed; test data removed.`);
    process.exit(failed ? 1 : 0);
  }
})();
