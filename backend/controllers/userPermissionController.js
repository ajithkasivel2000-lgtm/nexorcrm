const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { groupedPages, isPage, actionsFor } = require('../utils/pages');
const {
  permissionsFor, flatPermissionsFor, setPermission, clearPermission, clearAll, isSuperAdmin,
} = require('../utils/permissions');
const { auditEvent } = require('../utils/userAudit');
const { expandedDefaults, describeDefaults } = require('../utils/roleDefaults');

/** The page catalogue the permission screen renders from. */
exports.pages = (req, res) => res.status(200).json(groupedPages());

/** One user's permissions, plus the catalogue so the UI needs one request. */
exports.getForUser = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { restricted, superAdmin, pages } = await permissionsFor(user);
    return res.status(200).json({
      userId: user.id,
      username: user.username,
      role: user.status,
      superAdmin: Boolean(superAdmin),
      /* False means this person has no rows and is therefore unrestricted —
         the screen says so, rather than showing empty boxes that would read
         as "denied everything". */
      restricted,
      pages,
      catalogue: groupedPages(),
      /* What this role would give them, so the screen can offer to apply it
         and show how far a customised user has drifted from the template. */
      roleDefaults: expandedDefaults(user.status),
    });
  } catch (error) {
    return sendError(res, error, 'Error fetching permissions', 500);
  }
};

/** The signed-in user's own permissions, for gating the UI. */
exports.getMine = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    return res.status(200).json(await flatPermissionsFor(req.user));
  } catch (error) {
    return sendError(res, error, 'Error fetching your permissions', 500);
  }
};

/**
 * Save one page's permissions for one user.
 *
 * Sending every action false still writes a row — that is how a page is
 * explicitly closed. Sending `clear: true` removes the row instead.
 */
exports.setForUser = async (req, res) => {
  try {
    const { page, actions, clear } = req.body || {};
    if (!page) return res.status(400).json({ message: 'page is required.' });
    if (!isPage(page)) {
      return res.status(400).json({ message: `"${page}" is not a page in this application.` });
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (isSuperAdmin(user)) {
      return res.status(400).json({
        message: 'The super admin is never restricted, so permissions cannot be set for this account.',
      });
    }

    const actor = req.user?.username || null; // identity is the session, never a header

    if (clear) {
      await clearPermission(user.id, page);
      await auditEvent({
        userId: user.id, actor, action: 'PERMISSION_CLEARED', field: page,
      }).catch(() => { });
      return res.status(200).json({ cleared: true, page });
    }

    const row = await setPermission(user.id, page, actions || {}, actor);

    /* Granting or removing access is exactly what gets asked about later, so
       it is written to the same audit trail as a status change. */
    const granted = actionsFor(page).filter((a) => row[a]);
    await auditEvent({
      userId: user.id,
      actor,
      action: 'PERMISSION_SET',
      field: page,
      newValue: granted.length ? granted.join(', ') : 'no access',
    }).catch(() => { });

    return res.status(200).json(row);
  } catch (error) {
    return sendError(res, error, error.message || 'Error saving permissions', 400);
  }
};

/** Save several pages at once — what the screen's Save button sends. */
exports.setManyForUser = async (req, res) => {
  try {
    const { pages } = req.body || {};
    if (!pages || typeof pages !== 'object') {
      return res.status(400).json({ message: 'pages must be an object of { pageId: { view, create, … } }.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (isSuperAdmin(user)) {
      return res.status(400).json({
        message: 'The super admin is never restricted, so permissions cannot be set for this account.',
      });
    }

    const bad = Object.keys(pages).filter((p) => !isPage(p));
    if (bad.length) {
      return res.status(400).json({ message: `Not pages in this application: ${bad.join(', ')}.` });
    }

    const actor = req.user?.username || null; // identity is the session, never a header
    for (const [page, actions] of Object.entries(pages)) {
      // eslint-disable-next-line no-await-in-loop
      await setPermission(user.id, page, actions, actor);
    }

    await auditEvent({
      userId: user.id,
      actor,
      action: 'PERMISSIONS_SAVED',
      field: 'permissions',
      newValue: `${Object.keys(pages).length} page(s)`,
    }).catch(() => { });

    const { restricted, pages: saved } = await permissionsFor(user);
    return res.status(200).json({ restricted, pages: saved });
  } catch (error) {
    return sendError(res, error, error.message || 'Error saving permissions', 400);
  }
};

/** Remove every row, returning the user to unrestricted. */
exports.clearForUser = async (req, res) => {
  try {
    const count = await clearAll(req.params.id);
    await auditEvent({
      userId: req.params.id,
      actor: req.user?.username || null,
      action: 'PERMISSIONS_CLEARED',
      field: 'permissions',
      newValue: String(count),
    }).catch(() => { });
    return res.status(200).json({ cleared: count });
  } catch (error) {
    return sendError(res, error, 'Error clearing permissions', 500);
  }
};

/**
 * Put this user back on their role's default permissions.
 *
 * The same template a role change applies, available on its own so an
 * administrator who has customised somebody can undo it without demoting and
 * re-promoting them to trigger it.
 */
exports.applyRoleDefaults = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (isSuperAdmin(user)) {
      return res.status(400).json({ message: 'The super admin is never restricted.' });
    }

    const defaults = expandedDefaults(user.status);
    if (!defaults) {
      return res.status(400).json({ message: `No default permissions are defined for the ${user.status} role.` });
    }

    const actor = req.user?.username || null; // identity is the session, never a header
    await clearAll(user.id);
    for (const [page, actions] of Object.entries(defaults)) {
      // eslint-disable-next-line no-await-in-loop
      await setPermission(user.id, page, actions, actor);
    }

    await auditEvent({
      userId: user.id,
      actor,
      action: 'PERMISSIONS_RESET_TO_ROLE',
      field: 'permissions',
      newValue: `${user.status} defaults (${describeDefaults(user.status)})`,
    }).catch(() => { });

    const { restricted, pages } = await permissionsFor(user);
    return res.status(200).json({ restricted, pages, appliedFrom: user.status });
  } catch (error) {
    return sendError(res, error, 'Error applying the role defaults', 400);
  }
};
