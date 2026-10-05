/* Security rules that must never regress. None of these need a database. */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unused@localhost:1/unused';

const test = require('node:test');
const assert = require('node:assert/strict');
const totp = require('../../utils/totp');
const { accountBlockReason } = require('../../middleware/authMiddleware');
const { requestIp, isBannedIp, isDisallowedUsername } = require('../../utils/settings');
const { handleOf, publicSession } = require('../../utils/sessionHandle');
const { resourceFromPath } = require('../../utils/realtime');
const { prefixFor } = require('../../utils/refId');
const { verifyMetaSignature } = require('../../utils/whatsapp');
const { contentSecurityPolicy } = require('../../utils/securityHeaders');
const crypto = require('crypto');

test('CSP allows Cashfree checkout frames without opening other frame origins', () => {
  const csp = contentSecurityPolicy();
  const frameSrc = csp.split('; ').find((directive) => directive.startsWith('frame-src '));
  const formAction = csp.split('; ').find((directive) => directive.startsWith('form-action '));
  assert.ok(frameSrc.includes('https://sdk.cashfree.com'));
  assert.ok(frameSrc.includes('https://payments.cashfree.com'));
  assert.ok(frameSrc.includes('https://payments-test.cashfree.com'));
  assert.ok(!frameSrc.includes('https:;'));
  assert.ok(formAction.includes('https://sandbox.cashfree.com'));
  assert.ok(formAction.includes('https://api.cashfree.com'));
  assert.ok(!formAction.includes('https:;'));
});

test('TOTP matches the RFC 6238 test vectors', () => {
  const secret = totp.base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(totp.codeAt(secret, 59000), '287082');
  assert.equal(totp.codeAt(secret, 1111111109000), '081804');
  assert.equal(totp.codeAt(secret, 2000000000000), '279037');
});

test('TOTP accepts the current code, one step of drift, and nothing else', () => {
  const s = totp.newSecret();
  const now = Date.now();
  assert.ok(totp.verifyCode(s, totp.codeAt(s, now), now));
  assert.ok(totp.verifyCode(s, totp.codeAt(s, now - 30000), now));
  assert.ok(!totp.verifyCode(s, totp.codeAt(s, now - 120000), now) || totp.codeAt(s, now - 120000) === totp.codeAt(s, now));
  assert.ok(!totp.verifyCode(s, 'abcdef', now));
});

test('recovery codes work once each', () => {
  const { plain, hashed } = totp.newRecoveryCodes();
  assert.equal(plain.length, 10);
  const left = totp.consumeRecoveryCode(hashed, plain[3]);
  assert.equal(left.length, 9);
  assert.equal(totp.consumeRecoveryCode(left, plain[3]), null);
});

test('a tampered or expired login challenge is refused', () => {
  const c = totp.signChallenge('USR-1');
  assert.equal(totp.readChallenge(c).u, 'USR-1');
  assert.equal(totp.readChallenge(`${c.slice(0, -3)}abc`), null);
  assert.equal(totp.readChallenge(totp.signChallenge('USR-1', {}, -1000)), null);
});

test('accounts that may not sign in are blocked, with a reason', () => {
  for (const status of ['Banned', 'Suspended', 'Archived', 'Registered', 'Pending']) {
    assert.ok(accountBlockReason({ status }), status);
  }
  assert.ok(accountBlockReason({ status: 'Employee', lockedUntil: new Date(Date.now() + 60000) }));
  assert.equal(accountBlockReason({ status: 'Employee' }), null);
  assert.equal(accountBlockReason({ status: 'Partner' }), null);
});

test('the client IP comes from the proxy, never from the caller', () => {
  const req = { ip: '::ffff:9.9.9.9', body: { clientIp: '1.1.1.1' }, headers: { 'x-forwarded-for': '2.2.2.2' } };
  assert.equal(requestIp(req), '9.9.9.9');
  assert.ok(isBannedIp(req, { bannedIPs: ['9.9.9.9'] }));
  assert.ok(!isBannedIp(req, { bannedIPs: ['1.1.1.1', '2.2.2.2'] }));
  assert.ok(isDisallowedUsername('sysadmin', { disallowedUsernames: ['sys*'] }));
});

test('session lists expose a handle, never the token', () => {
  const row = { id: 'a'.repeat(64), username: 'x' };
  const out = publicSession(row, row.id);
  assert.notEqual(out.id, row.id);
  assert.equal(out.id, handleOf(row.id));
  assert.equal(out.current, true);
});

test('sessions get random ids, not readable counters', () => {
  assert.equal(prefixFor('session'), null);
  assert.equal(prefixFor('booking'), 'BKG');
});

test('Meta webhook signatures are checked against the app secret', () => {
  const body = Buffer.from('{"object":"page"}');
  const good = `sha256=${crypto.createHmac('sha256', 's3cret').update(body).digest('hex')}`;
  assert.ok(verifyMetaSignature(body, good, 's3cret'));
  assert.ok(!verifyMetaSignature(body, good, 'other'));
  assert.ok(!verifyMetaSignature(body, 'sha256=forged', 's3cret'));
  assert.ok(!verifyMetaSignature(body, good, ''));
});

test('live-update resource names match the frontend dataBus', () => {
  assert.equal(resourceFromPath('/api/users/12/activate'), 'users');
  assert.equal(resourceFromPath('/api/settings/mail'), 'settings');
  assert.equal(resourceFromPath('/other'), null);
});
