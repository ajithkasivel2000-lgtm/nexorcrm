const express = require('express');
const router = express.Router();
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const c = require('../controllers/userPermissionController');

/*
 * Per-user permissions.
 *
 *   GET    /api/user-permissions/pages   the page catalogue
 *   GET    /api/user-permissions/me      my own, for gating the UI
 *   GET    /api/user-permissions/:id     one user's, for the admin screen
 *   PUT    /api/user-permissions/:id     save several pages at once
 *   PATCH  /api/user-permissions/:id     save or clear a single page
 *   DELETE /api/user-permissions/:id     clear them all
 *
 * Reading your own is open to any signed-in user — the app gates its own menus
 * with it. Changing anyone's is Admin only: granting access is not a decision
 * to delegate downward.
 *
 * The two literal paths come before /:id, or "me" and "pages" would be read as
 * user ids.
 */
router.get('/pages', authMiddleware, c.pages);
router.get('/me', authMiddleware, c.getMine);

router.get('/:id', authMiddleware, c.getForUser);
router.put('/:id', authMiddleware, requireAdmin, c.setManyForUser);
router.patch('/:id', authMiddleware, requireAdmin, c.setForUser);
router.delete('/:id', authMiddleware, requireAdmin, c.clearForUser);

/* Re-apply the role template without demoting and re-promoting to trigger it. */
router.post('/:id/apply-role-defaults', authMiddleware, requireAdmin, c.applyRoleDefaults);

module.exports = router;
