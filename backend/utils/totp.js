const crypto = require('crypto');

/**
 * Time-based one-time passwords (RFC 6238) for two-factor sign-in with an
 * authenticator app — Google Authenticator, Microsoft Authenticator, Authy.
 * Six digits, 30-second steps, SHA-1: the parameters every app assumes.
 *
 * Also: recovery codes (hashed at rest, each usable once) and the short-lived
 * signed "challenge" that carries a half-finished login from the password step
 * to the code step without creating a session in between.
 */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0; let value = 0; const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

const newSecret = () => base32Encode(crypto.randomBytes(20));

function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = mac[mac.length - 1] & 15;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return String(code).padStart(6, '0');
}

/** The code for a given time (for tests). */
const codeAt = (secret, time = Date.now()) => hotp(secret, Math.floor(time / 30000));

/** True when `code` is valid now, allowing one step of clock drift either way. */
function verifyCode(secret, code, time = Date.now()) {
  const given = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(given) || !secret) return false;
  const step = Math.floor(time / 30000);
  for (const drift of [0, -1, 1]) {
    const expected = hotp(secret, step + drift);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return true;
  }
  return false;
}

/** The URI authenticator apps read from a QR code. */
function otpauthUri(secret, account, issuer = 'NexorCRM') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/* ---- recovery codes ------------------------------------------------------ */

const hashRecovery = (code) => crypto.createHash('sha256').update(String(code).replace(/[\s-]/g, '').toLowerCase()).digest('hex');

/** Ten fresh codes: the plain ones to show once, and their hashes to store. */
function newRecoveryCodes(count = 10) {
  const plain = Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString('hex');
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  return { plain, hashed: plain.map(hashRecovery) };
}

/** If `code` is one of the stored recovery codes, the list without it; else null. */
function consumeRecoveryCode(stored, code) {
  const h = hashRecovery(code);
  if (!Array.isArray(stored) || !stored.includes(h)) return null;
  return stored.filter((x) => x !== h);
}

/* ---- login challenge ----------------------------------------------------- */

/* Signs the half-finished login. A configured secret when there is one; else a
   per-process key, so challenges simply lapse on restart (they live 5 minutes). */
const PROCESS_KEY = crypto.randomBytes(32);
const challengeKey = () => {
  const configured = String(process.env.ACTIVATION_SECRET || process.env.WEBHOOK_SECRET || '');
  return configured.length >= 16 ? crypto.createHash('sha256').update(`2fa:${configured}`).digest() : PROCESS_KEY;
};

function signChallenge(userId, extra = {}, ttlMs = 5 * 60 * 1000) {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + ttlMs, ...extra })).toString('base64url');
  const sig = crypto.createHmac('sha256', challengeKey()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** The challenge's contents when genuine and unexpired, else null. */
function readChallenge(token) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', challengeKey()).update(payload).digest('base64url');
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.e > Date.now() ? data : null;
  } catch {
    return null;
  }
}

module.exports = {
  newSecret, verifyCode, codeAt, otpauthUri, newRecoveryCodes, consumeRecoveryCode, signChallenge, readChallenge, base32Encode, base32Decode,
};
