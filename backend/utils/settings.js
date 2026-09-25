/**
 * The global settings tables, made real.
 *
 * SecuritySetting, SessionSetting, GlobalUserSetting and RegistrationSetting
 * all had full settings pages and controllers that saved whatever was typed —
 * and no backend code that read any of it, so every promise those screens made
 * was false. These helpers are the read side of that picture:
 *
 *   - the values are cached for a few seconds, because they are consulted on
 *     every login and every authenticated request, and a hot settings read on
 *     each of those is waste;
 *   - the cache is short enough that an administrator's change takes effect
 *     without a restart, and the settings controllers drop it on write.
 *
 * Nothing here throws: a settings table that cannot be read must not take
 * sign-in down with it, so every reader falls back to the same defaults the
 * schema ships with.
 */
const prisma = require('../prismaClient');
const { currentCompanyId } = require('./tenant');

const CACHE_MS = 5 * 1000;
const cache = new Map();

/* Every company has its own settings rows, so the cache is keyed by company:
   one company's session timeout must never answer for another's. */
const scoped = (key) => `${currentCompanyId() || '-'}:${key}`;

/* Each settings table is one row per company. findFirst() without an orderBy
   leaves the choice of row to the database's plan; a duplicate created by a
   race or a repair script would then flip-flop between values. Ordering by
   createdAt asc (id as the tiebreaker) makes the OLDEST row the authority,
   deterministically, everywhere. */
const SINGLETON_ORDER = [{ createdAt: 'asc' }, { id: 'asc' }];

async function cached(name, loader, fallback) {
  const key = scoped(name);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  try {
    const value = await loader();
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (error) {
    console.error(`Could not read ${name}:`, error.message);
    return fallback;
  }
}

/** Settings controllers call this after a successful update. */
function invalidateSettings(...keys) {
  if (keys.length === 0) return cache.clear();
  for (const key of keys) cache.delete(scoped(key));
}

/* -------------------------------------------------------------------------- */
/*  SessionSetting — timeouts, expiry, remember-me                             */
/* -------------------------------------------------------------------------- */

const SESSION_DEFAULTS = {
  userInactivityTimeout: 20,   // minutes; 0 disables
  guestTimeout: 5,             // minutes (reserved; no guest sessions yet)
  resetExpiryAtLogon: 'Yes',
  cookieExpiry: 14,            // days
  cookiePath: '/',
};

function getSessionSettings() {
  return cached('sessionSetting', async () => {
    const row = await prisma.sessionSetting.findFirst({ orderBy: SINGLETON_ORDER });
    return { ...SESSION_DEFAULTS, ...(row || {}) };
  }, { ...SESSION_DEFAULTS });
}

/* -------------------------------------------------------------------------- */
/*  SecuritySetting — banned IPs, disallowed usernames                         */
/* -------------------------------------------------------------------------- */

const SECURITY_DEFAULTS = { bannedIPs: [], disallowedUsernames: [] };

function getSecuritySettings() {
  return cached('securitySetting', async () => {
    const row = await prisma.securitySetting.findFirst({ orderBy: SINGLETON_ORDER });
    return { ...SECURITY_DEFAULTS, ...(row || {}) };
  }, { ...SECURITY_DEFAULTS });
}

/**
 * The caller's IP.
 *
 * req.ip only: with 'trust proxy' set in index.js it is the address nginx saw,
 * taken from the one X-Forwarded-For hop nginx itself appended. The body's
 * clientIp and the raw X-Forwarded-For header are whatever the caller chose to
 * send, so trusting them let anyone dodge an IP ban or forge the audit trail.
 */
function requestIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '').trim();
}

/**
 * True when this IP is on the banned list. Exact match; ::ffff: normalised.
 * Pass the saved Security Settings (getSecuritySettings) — without them there
 * is no list to check.
 */
function isBannedIp(req, settings) {
  const banned = settings?.bannedIPs || [];
  if (!banned.length) return false;
  const ip = requestIp(req);
  if (!ip) return false;
  return banned.some((b) => String(b).trim() === ip);
}

/**
 * True when this username may not be registered.
 *
 * List entries may be written plain ('root') or with a '*' wildcard
 * ('sys*'), matching the way the settings page describes them. Comparison is
 * case-insensitive — usernames are display-level identities in this app.
 */
function isDisallowedUsername(username, settings) {
  const disallowed = settings?.disallowedUsernames || [];
  if (!disallowed.length || !username) return false;
  const name = String(username).trim().toLowerCase();
  return disallowed.some((entry) => {
    const pattern = String(entry).trim().toLowerCase();
    if (!pattern) return false;
    if (pattern.includes('*')) {
      const re = new RegExp(`^${pattern.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
      return re.test(name);
    }
    return pattern === name;
  });
}

/* -------------------------------------------------------------------------- */
/*  GlobalUserSetting — home pages, multiple logins                            */
/* -------------------------------------------------------------------------- */

const USER_DEFAULTS = {
  allowMultipleLogins: true,
  individualUserHomepages: false,
  howAreTheySet: 'By Admin (Set below..)',
  pathSetByAdmin: '/',
  excludeAdmins: true,
};

function getGlobalUserSettings() {
  return cached('globalUserSetting', async () => {
    const row = await prisma.globalUserSetting.findFirst({ orderBy: SINGLETON_ORDER });
    return { ...USER_DEFAULTS, ...(row || {}) };
  }, { ...USER_DEFAULTS });
}

/**
 * The page a user should land on after signing in, or null for the default.
 *
 * The legacy script this feature came from redirected users to a page of
 * their own after logon; the SPA honours it with a redirect in the login
 * response. Admin accounts are skipped when Exclude Admins is set, and the
 * whole feature is off unless Individual User Homepages is on.
 */
async function homePageFor(user) {
  const settings = await getGlobalUserSettings();
  if (!settings.individualUserHomepages) return null;
  if (settings.excludeAdmins
    && (user.username === 'admin' || ['admin', 'superadmin'].includes(String(user.status || '').toLowerCase()))) {
    return null;
  }
  const byUser = String(settings.howAreTheySet || '').startsWith('By User');
  const raw = byUser ? user.homePagePath : settings.pathSetByAdmin;
  const page = String(raw || '').trim();
  if (!page) return null;
  // The admin template may name the user with %username%.
  return page.includes('%username%') ? page.split('%username%').join(user.username) : page;
}

/* -------------------------------------------------------------------------- */
/*  RegistrationSetting — the rules the signup endpoint enforces               */
/* -------------------------------------------------------------------------- */

const REGISTRATION_DEFAULTS = {
  accountActivation: 'Admin Activation',
  limitUsernameCharacters: 'Letter Num and Spaces',
  usernameLengthMin: 5,
  usernameLengthMax: 36,
  passwordLengthMin: 8,
  passwordLengthMax: 120,
  sendWelcomeEmail: true,
  enableCaptcha: false,
  usernameLowercase: false,
};

function getRegistrationSettings() {
  return cached('registrationSetting', async () => {
    const row = await prisma.registrationSetting.findFirst({ orderBy: SINGLETON_ORDER });
    return { ...REGISTRATION_DEFAULTS, ...(row || {}) };
  }, { ...REGISTRATION_DEFAULTS });
}

/** The subset the public signup form is allowed to see (no server secrets here). */
function publicRegistrationRules(settings) {
  return {
    accountActivation: settings.accountActivation,
    limitUsernameCharacters: settings.limitUsernameCharacters,
    usernameLengthMin: settings.usernameLengthMin,
    usernameLengthMax: settings.usernameLengthMax,
    passwordLengthMin: settings.passwordLengthMin,
    passwordLengthMax: settings.passwordLengthMax,
    enableCaptcha: settings.enableCaptcha,
  };
}

/** Character sets the Limit Username Characters option allows. */
function allowedUsernameChars(mode) {
  switch (String(mode || '')) {
    case 'Alphanumeric Only': return /^[A-Za-z0-9]+$/;
    case 'Alphanumeric Spacers': return /^[A-Za-z0-9 _.-]+$/;
    case 'Any Letter Num': return /^[A-Za-z0-9._@-]+$/;
    case 'Letter Num and Spaces': return /^[A-Za-z0-9 _.@-]+$/;
    // 'Any Chars' and anything unrecognised: only whitespace is refused.
    default: return /^\S+$/;
  }
}

/* -------------------------------------------------------------------------- */
/*  Session hygiene                                                            */
/* -------------------------------------------------------------------------- */

const SESSION_SWEEP_MIN_INTERVAL_MS = 60 * 1000;
const lastSweep = new Map(); // per company

/**
 * Deletes expired and long-idle session rows.
 *
 * verifySession already refuses a token whose row has expired or gone idle,
 * so this is the janitor, not the guard: it keeps the sessions tab and the
 * table itself from filling with rows nobody can use again. Runs at most once
 * a minute and never throws — called from the login path, which must not fail
 * because of housekeeping.
 */
async function sweepSessions() {
  const now = Date.now();
  const company = currentCompanyId() || '-';
  if (now - (lastSweep.get(company) || 0) < SESSION_SWEEP_MIN_INTERVAL_MS) return;
  lastSweep.set(company, now);
  try {
    const settings = await getSessionSettings();
    const idleCutoff = settings.userInactivityTimeout > 0
      ? new Date(now - settings.userInactivityTimeout * 60 * 1000)
      : null;
    await prisma.session.deleteMany({
      where: {
        OR: [
          { expiry: { lt: new Date(now) } },
          ...(idleCutoff ? [{ lastActive: { lt: idleCutoff } }] : []),
        ],
      },
    });
  } catch (error) {
    console.error('Session sweep failed:', error.message);
  }
}

module.exports = {
  invalidateSettings,
  getSessionSettings,
  getSecuritySettings,
  getGlobalUserSettings,
  getRegistrationSettings,
  publicRegistrationRules,
  allowedUsernameChars,
  isBannedIp,
  isDisallowedUsername,
  requestIp,
  homePageFor,
  sweepSessions,
};
