const prisma = require('../prismaClient');
const { getSessionSettings } = require('../utils/settings');
const tenant = require('../utils/tenant');
const { accessFor } = require('../utils/billing');

/**
 * Middleware: verify that the request carries a real, unexpired session token.
 *
 * The token is issued by POST /api/auth/login, which creates a Session row and
 * returns `sess_<sessionId>`. Every signed-in request must present it in the
 * Authorization header (Bearer scheme) or the X-Auth-Token header; the bare
 * X-Session-Id header is still accepted so a browser mid-upgrade keeps
 * working until its next sign-in.
 *
 * This replaced an earlier scheme where the username in an X-Username header
 * WAS the identity — which meant anyone who knew a username could be that
 * user. The username header is no longer consulted here at all; controllers
 * that need a display name read req.user, which this middleware loads from
 * the session row's owner.
 *
 * Attach it to every route that touches customer data:
 *   router.get('/', authMiddleware, controller.getSomething);
 *
 * Intentionally public — the website lead forms, /api/auth/login and friends,
 * /api/push/public-key and /api/ai/status — do NOT use this middleware.
 */

/**
 * Why this account may not be used right now, or null when it may.
 *
 * One rule for every way in — password login, Google, Microsoft and every
 * authenticated request — so no door is softer than another. Registered and
 * Pending accounts are waiting on activation (an emailed link or the Activate
 * button in User Admin); letting them sign in made activation meaningless.
 */
function accountBlockReason(user) {
  const status = String(user?.status || '').toLowerCase();
  if (status === 'banned') return 'Your account has been banned.';
  if (status === 'suspended') {
    return user.statusReason
      ? `Your account is suspended: ${user.statusReason}`
      : 'Your account has been suspended. Contact your administrator.';
  }
  if (status === 'archived') return 'This account has been archived.';
  if (status === 'registered' || status === 'pending') {
    return 'Your account is waiting for activation. Check your email for the activation link, or ask an administrator.';
  }
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.max(1, Math.ceil((user.lockedUntil - new Date()) / 60000));
    return `Account locked. Try again in ${mins} minute(s).`;
  }
  return null;
}

/** Pulls the session token off the request, wherever the client put it. */
function extractToken(req) {
  const auth = req.headers['authorization'];
  if (auth && /^Bearer\s+\S+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, '').trim();
  }
  if (req.headers['x-auth-token']) {
    return String(req.headers['x-auth-token']).trim();
  }
  // Transition header: some clients still send the bare session id.
  if (req.headers['x-session-id']) {
    return String(req.headers['x-session-id']).trim();
  }
  return null;
}

/** `sess_<id>` is what login hands out; older tokens may be the bare id. */
const sessionIdOf = (token) => (String(token).startsWith('sess_') ? String(token).slice(5) : String(token));

/**
 * Verifies the token and loads the user it belongs to.
 *
 * Resolves with { user, sessionId } or an error the middleware can answer
 * with. A token that no longer matches a live, unexpired Session row is
 * refused — that is what makes session revocation end access the moment the
 * row is deleted.
 */
async function verifySession(token) {
  const sessionId = sessionIdOf(token);
  if (!sessionId || sessionId.length < 10) {
    return { error: { status: 401, message: 'Invalid session token. Please sign in again.' } };
  }

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.expiry <= new Date()) {
    return { error: { status: 401, message: 'Your session has expired. Please sign in again.' } };
  }

  // From here on the request belongs to the session's company.
  tenant.adopt(session.companyId);
  const company = await prisma.company.findUnique({ where: { id: session.companyId } });
  if (!company || company.status !== 'Active') {
    return { error: { status: 403, message: 'This company account is suspended. Contact your provider.' } };
  }
  const subscription = accessFor(company);

  /* The inactivity timeout from Session Settings, applied on every request:
     a session idle for longer than the configured minutes is refused even
     though its absolute expiry has not passed. 0 disables the check. The
     settings read is cached, so this costs a query at most every few seconds
     rather than on every request. */
  try {
    const { userInactivityTimeout } = await getSessionSettings();
    if (userInactivityTimeout > 0) {
      const idleMs = Date.now() - new Date(session.lastActive).getTime();
      if (idleMs > userInactivityTimeout * 60 * 1000) {
        // The dead row goes now; the sweep would catch it later anyway.
        prisma.session.delete({ where: { id: session.id } }).catch(() => {});
        return { error: { status: 401, message: 'You were signed out after a period of inactivity. Please sign in again.' } };
      }
    }
  } catch { /* a settings problem must not sign everybody out */ }

  const user = await prisma.user.findUnique({ where: { username: session.username } });
  if (!user) {
    return { error: { status: 401, message: 'The account behind this session no longer exists.' } };
  }
  // Banned, suspended, archived, awaiting activation or locked: no API access.
  const blocked = accountBlockReason(user);
  if (blocked) {
    return { error: { status: 403, message: blocked } };
  }

  // Keep the session's own activity marker moving, so the sessions tab shows
  // which devices are actually in use. Best-effort: never fail a request for it.
  prisma.session.update({
    where: { id: session.id },
    data: { lastActive: new Date() },
  }).catch(() => {});

  return { user, sessionId: session.id, companyId: session.companyId, subscription };
}

/**
 * Verifies the token, then runs `next` inside the session's company: every
 * query the route makes is scoped to it (see utils/tenant.js).
 */
function withSession(token) {
  return tenant.runResolving(() => verifySession(token));
}

/**
 * Channel partners sign in to the partner portal and nowhere else. They hold no
 * permission rows, and a user with none is unrestricted by design (see
 * utils/permissions.js) — so the wall is here, on the path, before any of the
 * CRM's own routes can see the request.
 */
const isPartnerUser = (user) => String(user?.status || '') === 'Partner';
const BILLING_PATHS = ['/api/billing', '/api/auth/', '/api/company', '/api/notifications', '/api/push/', '/api/user-permissions/me', '/api/users/username/'];
const PARTNER_PATHS = ['/api/partner/', '/api/auth/', '/api/notifications', '/api/push/'];

function authMiddleware(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Authentication required. Please sign in.' });
  }

  withSession(token)
    .then((result) => {
      if (result.error) {
        return res.status(result.error.status).json({ message: result.error.message });
      }
      req.user = result.user;
      req.sessionId = result.sessionId;
      req.companyId = result.companyId;
      req.subscription = result.subscription;
      /* A lapsed trial or subscription: sign-in still works, but only billing
         (and what the app needs to show it) opens until a plan is paid. */
      if (result.subscription && !result.subscription.allowed
        && !BILLING_PATHS.some((p) => req.originalUrl.startsWith(p))) {
        return res.status(402).json({ message: result.subscription.reason, code: 'SUBSCRIPTION_INACTIVE' });
      }
      if (isPartnerUser(result.user) && !PARTNER_PATHS.some((p) => req.originalUrl.startsWith(p))) {
        return res.status(403).json({ message: 'Channel partner accounts can only use the partner portal.' });
      }
      return tenant.runWithCompany(result.companyId, () => next());
    })
    .catch((err) => {
      console.error('Auth middleware error:', err);
      res.status(500).json({ message: 'Authentication check failed.' });
    });
}

/**
 * Optional auth: resolves the user if a valid session token is presented, but
 * allows unauthenticated requests to pass through with req.user = null (for
 * endpoints that work differently based on presence/absence of a user).
 */
function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    req.user = null;
    return tenant.runResolving(() => next());
  }

  withSession(token)
    .then((result) => {
      req.user = result.user || null;
      req.sessionId = result.sessionId || null;
      if (result.companyId && !result.error) {
        req.companyId = result.companyId;
        return tenant.runWithCompany(result.companyId, () => next());
      }
      return tenant.runResolving(() => next());
    })
    .catch(() => {
      req.user = null;
      tenant.runResolving(() => next());
    });
}

/**
 * Only the superadmin gets past this.
 *
 * Deleting a record is the one action that cannot be undone, so it is held to
 * the single account rather than to anyone with an Admin badge. Runs *after*
 * authMiddleware, which is what puts req.user there.
 *
 * The UI hides the delete controls for everyone else, but that is presentation
 * — this is the part that actually refuses.
 */
function requireSuperAdmin(req, res, next) {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  // Either signal counts: the reserved username, or the status the record
  // carries. They are set independently, and a mismatch should not lock the
  // real superadmin out of their own system.
  const isSuper = user.username === 'admin'
    || String(user.status || '').toLowerCase() === 'superadmin';

  if (!isSuper) {
    return res.status(403).json({ message: 'Only the super admin can delete records.' });
  }

  return next();
}

/* ---------------------------------------------------------------------------
   Role gates.

   The status column doubles as the role in this app (Admin / Manager /
   Employee are statuses), so these read the same signals the rest of the
   code does: the reserved admin username, the status word, and userlevel as
   a numeric fallback. They run AFTER authMiddleware, which is what puts
   req.user on the request — on their own they refuse everything.
   -------------------------------------------------------------------------- */

const isSuperUser = (user) => Boolean(user) && (
  user.username === 'admin'
  || String(user.status || '').toLowerCase() === 'superadmin'
  || String(user.status || '') === 'Admin'
  || (user.userlevel || 0) >= 9
);

/** Anyone at Manager level or above (managers, admins, the superadmin). */
const isManagerUser = (user) => isSuperUser(user)
  || String(user.status || '') === 'Manager'
  || (user.userlevel || 0) >= 8;

/** Requires req.user to be set — the shared precondition of both gates. */
function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }
  return next();
}

/**
 * Only administrators get past this: role changes, account activation,
 * the permission matrix and other settings-level writes.
 */
function requireAdmin(req, res, next) {
  requireUser(req, res, () => {
    if (!isSuperUser(req.user)) {
      return res.status(403).json({ message: 'Only administrators can do this.' });
    }
    return next();
  });
}

/**
 * Managers and above: organizational edits (reporting lines, groups),
 * session revocation, unlock — the people-management actions.
 */
function requireManager(req, res, next) {
  requireUser(req, res, () => {
    if (!isManagerUser(req.user)) {
      return res.status(403).json({ message: 'You do not have permission to do this.' });
    }
    return next();
  });
}

module.exports = {
  authMiddleware, optionalAuth, requireSuperAdmin,
  verifySession, extractToken, accountBlockReason,
  requireUser, requireAdmin, requireManager,
  isSuperUser, isManagerUser, isPartnerUser,
};
