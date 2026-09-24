/**
 * What a given person is allowed to do.
 *
 * Permissions are held per user, one row per page, in UserPermission. There is
 * no role layer: what an administrator ticks on the user's own screen is what
 * is stored and what is enforced.
 *
 * Two rules decide everything:
 *
 *   1. A user with NO permission rows at all is unrestricted. The system is
 *      being added to an app that ran without one, so silence means "as
 *      before" — otherwise enabling it would lock everyone out at once.
 *   2. Once a user has any row, they are governed by their rows: a page with
 *      no row is closed to them. Otherwise granting one page would silently
 *      leave the other thirteen wide open.
 *
 * The super admin is never gated, so a mistake in here can always be undone.
 */

const prisma = require('../prismaClient');
const { ALL_ACTIONS, actionsFor, isPage } = require('./pages');

/** Accounts no permission check applies to. */
const isSuperAdmin = (user) => Boolean(
  user && (user.username === 'admin' || user.status === 'superadmin'),
);

/* One user's rows, cached for a few seconds. A permission check happens per
   request, sometimes twice; a database round trip each time would be a round
   trip per button. Short enough that a change is live almost at once. */
const CACHE_MS = 5000;
const cache = new Map();

async function rowsFor(userId) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const rows = await prisma.userPermission.findMany({ where: { userId } });
  cache.set(userId, { rows, at: Date.now() });
  return rows;
}

/** Drop the cache for one user, or everyone. Called after every save. */
function invalidate(userId) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

/**
 * Can this user do `action` on `page`?
 *
 * Never throws: a permission system that errors must not take the application
 * down with it, so an unreadable table allows and logs.
 */
async function can(user, page, action) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  try {
    const rows = await rowsFor(user.id);
    // Rule 1 — nothing configured for this person.
    if (rows.length === 0) return true;

    const row = rows.find((r) => r.page === page);
    // Rule 2 — governed by their rows; an absent page is closed.
    if (!row) return false;
    return Boolean(row[action]);
  } catch (error) {
    console.error('Permission check failed, allowing through:', error.message);
    return true;
  }
}

/**
 * The full permission set for one user, for the UI and for /me.
 *
 * `restricted` says which of the two rules is in play, so the screen can tell
 * an administrator that this person is currently unrestricted rather than
 * showing fourteen rows of unticked boxes that would suggest the opposite.
 */
async function permissionsFor(user) {
  if (!user) return { restricted: false, pages: {} };
  if (isSuperAdmin(user)) return { restricted: false, superAdmin: true, pages: {} };

  const rows = await rowsFor(user.id).catch(() => []);
  const pages = {};
  for (const row of rows) {
    pages[row.page] = Object.fromEntries(
      ALL_ACTIONS.map((a) => [a, Boolean(row[a])]),
    );
  }
  return { restricted: rows.length > 0, pages };
}

/**
 * The same thing flattened to the shape the front end gates on:
 * `[{ page, view, create, edit, delete, export }]`.
 */
async function flatPermissionsFor(user) {
  const { restricted, superAdmin, pages } = await permissionsFor(user);
  return {
    restricted,
    superAdmin: Boolean(superAdmin),
    permissions: Object.entries(pages).map(([page, actions]) => ({ page, ...actions })),
  };
}

/** Replace one page's permissions for one user. */
async function setPermission(userId, page, actions, grantedBy = null) {
  if (!isPage(page)) throw new Error(`"${page}" is not a page in this application.`);

  const allowed = actionsFor(page);
  const data = { view: false, create: false, edit: false, delete: false, export: false };
  for (const action of ALL_ACTIONS) {
    // Only actions this page supports can be set; the rest stay false.
    if (allowed.includes(action)) data[action] = Boolean(actions?.[action]);
  }

  const row = await prisma.userPermission.upsert({
    where: { userId_page: { userId, page } },
    update: { ...data, grantedBy },
    create: { userId, page, ...data, grantedBy },
  });
  invalidate(userId);
  return row;
}

/** Remove one page's row, returning that page to the user's default. */
async function clearPermission(userId, page) {
  await prisma.userPermission.deleteMany({ where: { userId, page } });
  invalidate(userId);
}

/** Remove every row, making the user unrestricted again. */
async function clearAll(userId) {
  const out = await prisma.userPermission.deleteMany({ where: { userId } });
  invalidate(userId);
  return out.count;
}

/**
 * Express guard: `requirePermission('projects', 'edit')`.
 *
 * Applied per route rather than globally, so each one is a deliberate decision
 * and a mistake affects one endpoint instead of the whole API.
 */
function requirePermission(page, action) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    try {
      if (await can(req.user, page, action)) return next();
      return res.status(403).json({
        message: `You do not have permission to ${action} ${page.replace(/-/g, ' ')}.`,
        page,
        action,
      });
    } catch (error) {
      console.error('Permission guard failed, allowing through:', error.message);
      return next();
    }
  };
}

/**
 * Like requirePermission, but any one of several grants will do — for an action
 * that more than one page legitimately performs (converting a lead creates an
 * opportunity, so a lead editor may do it without opportunities:create).
 */
function requireAnyPermission(...grants) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    try {
      for (const [page, action] of grants) {
        if (await can(req.user, page, action)) return next();
      }
      const [page, action] = grants[0];
      return res.status(403).json({
        message: `You do not have permission to ${action} ${page.replace(/-/g, ' ')}.`,
        page,
        action,
      });
    } catch (error) {
      console.error('Permission guard failed, allowing through:', error.message);
      return next();
    }
  };
}

module.exports = {
  can,
  permissionsFor,
  flatPermissionsFor,
  setPermission,
  clearPermission,
  clearAll,
  requirePermission,
  requireAnyPermission,
  invalidate,
  isSuperAdmin,
};
