/**
 * Failed-login streaks, per account AND per source IP.
 *
 * Why per-IP: the old counter sat on the User row alone, so an attacker with
 * a list of usernames could send one wrong password to each and lock every
 * account in the company for fifteen minutes — five requests, hundreds of
 * victims. Counting per (account, IP) means a lockout needs one source to
 * produce the whole streak: exactly the targeted password-guessing the lock
 * exists to stop. A spray spread across addresses never reaches the threshold
 * for any victim, and each address is still capped by the login rate limit.
 *
 * In memory, like middleware/rateLimit.js: one process serves the app, and
 * the streak only has to outlive itself by the window below. A restart
 * forgets streaks — the same trade the IP rate limiter already makes.
 *
 * The window decays: a streak counts failures within WINDOW_MS of the most
 * recent one, so a user who mistypes twice, walks away and comes back the
 * next hour starts clean.
 */

const WINDOW_MS = 15 * 60 * 1000;

/** Consecutive failures from one IP that lock the account. */
const MAX_LOGIN_ATTEMPTS = 5;

const buckets = new Map();

// Forget dead streaks so the map does not grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now - entry.lastAt > WINDOW_MS) buckets.delete(key);
  }
}, 60 * 1000).unref();

const keyOf = (userId, ip) => `${userId}|${ip || 'unknown'}`;

/**
 * Record one failure for (account, ip); returns the streak length — how many
 * consecutive failures this source has made against this account.
 */
function recordLoginFailure(userId, ip) {
  const key = keyOf(userId, ip);
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now - entry.lastAt > WINDOW_MS) {
    buckets.set(key, { count: 1, lastAt: now });
    return 1;
  }
  entry.count += 1;
  entry.lastAt = now;
  return entry.count;
}

/** A success (or an admin unlock) clears every streak against the account. */
function resetLoginFailures(userId) {
  for (const key of buckets.keys()) {
    if (key.startsWith(`${userId}|`)) buckets.delete(key);
  }
}

module.exports = { MAX_LOGIN_ATTEMPTS, recordLoginFailure, resetLoginFailures };
