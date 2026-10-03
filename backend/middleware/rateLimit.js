const { requestIp } = require('../utils/settings');

/**
 * A small per-IP rate limit for the endpoints anyone on the internet can call:
 * the website/campaign lead forms, login, signup and the password flows.
 *
 * In memory, one fixed window per IP and bucket. That is deliberately simple:
 * the app runs as one process, and the goal is to stop a script flooding the
 * CRM with leads or guessing passwords, not to meter fair use precisely.
 *
 *   router.post('/login', rateLimit('login', { max: 10, windowMs: 60_000 }), ...)
 */
const buckets = new Map();

// Forget windows that have ended, so the map does not grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref();

/* The e2e suite fires many logins and signups back-to-back from one IP and
   hits the limit well inside the test timeout; the alternative — sleeping
   between tests — turns a fast run into a slow one for a check this file is
   not what the tests are measuring. In production this flag stays unset and
   the limiter protects what it was written for. */
const DISABLED = String(process.env.DISABLE_RATE_LIMITS || '').toLowerCase() === 'true';

function rateLimit(name, { max, windowMs }) {
  if (DISABLED) return (req, res, next) => next();
  return (req, res, next) => {
    const key = `${name}:${requestIp(req) || 'unknown'}`;
    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ message: 'Too many requests. Please wait a moment and try again.' });
    }
    return next();
  };
}

/** Empty every bucket. Used by e2e teardown so one suite does not poison the
 *  next, and by any admin surface that resets its own counters. */
function resetRateLimits() { buckets.clear(); }

module.exports = { rateLimit, resetRateLimits };
