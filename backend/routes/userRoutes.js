const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const userAdminController = require('../controllers/userAdminController');
const {
  authMiddleware, requireSuperAdmin, requireAdmin, requireManager,
} = require('../middleware/authMiddleware');

/* ---- Account lifecycle: who may do what -----------------------------------
   Every route here is a change to somebody else's account, so each carries a
   role gate — an authenticated Employee used to be able to promote themselves
   to superadmin with one fetch call.

   The role word lives in the status column and the controllers also run their
   own checks (self-action and superadmin protection), so a Manager's UI
   showing them a control the route refuses is the failure mode — these gates
   match the controls the screens actually render:
     · role ladder (promote/demote) + activation  → Admin
     · groups / homepage / organizational fields  → Manager
     · everything below is Manager+ or Admin-only per userAdminController.
   -------------------------------------------------------------------------- */

// Activation hands out a real role — Admin-only, matching the "Users
// awaiting activation" tab that only Admins act on.
router.post('/activate', authMiddleware, requireAdmin, userController.activateUsers);
router.delete('/delete-inactive', authMiddleware, requireSuperAdmin, userController.deleteInactiveUsers);

// Role ladder (promote/demote/ban actions) — Admin-only, same as the UI that
// only renders the RoleAction strip at Admin level and above.
router.put('/:id/status', authMiddleware, requireAdmin, userController.updateStatus);

// Group membership and the user's landing page are people-management, not
// role changes — Manager and above.
router.put('/:id/groups', authMiddleware, requireManager, userController.updateUserGroups);
router.put('/:id/homepage', authMiddleware, requireManager, userController.updateHomePage);

// Creating a user and editing one are Manager actions, matching the
// "Create User" button and profile form the screens show at Manager+.
router.post('/', authMiddleware, requireManager, userController.createUser);
router.put('/:id', authMiddleware, requireManager, userController.updateUser);

/* ---- User 360° routes -----------------------------------------------------
   All under /api/users/:id/... to match the existing naming. Static segments
   come before the :id routes below so 'overview', 'workload' and friends are
   never read as an id. ------------------------------------------------------ */
router.get('/:id/overview', authMiddleware, userAdminController.getOverview);
router.get('/:id/stats', authMiddleware, userAdminController.getStats);
router.get('/:id/audit', authMiddleware, userAdminController.getAudit);
router.get('/:id/status-history', authMiddleware, userAdminController.getStatusHistory);
router.get('/:id/reporting', authMiddleware, userAdminController.getReporting);
router.get('/:id/preferences', authMiddleware, userAdminController.getPreferences);
router.put('/:id/preferences', authMiddleware, userAdminController.updatePreferences);
router.get('/:id/sessions', authMiddleware, userAdminController.listSessions);
router.delete('/:id/sessions/:sessionId', authMiddleware, requireManager, userAdminController.revokeSession);
router.post('/:id/revoke-sessions', authMiddleware, requireManager, userAdminController.revokeSessions);
router.post('/:id/reset-password', authMiddleware, requireAdmin, userAdminController.resetPassword);
router.post('/:id/force-password-change', authMiddleware, requireAdmin, userAdminController.forcePasswordChange);
router.post('/:id/unlock', authMiddleware, requireManager, userAdminController.unlock);
// A lost phone: an administrator switches two-factor off so the user can set it up again.
router.post('/:id/reset-2fa', authMiddleware, requireAdmin, userAdminController.resetTwoFactor);
router.post('/:id/notify', authMiddleware, requireManager, userAdminController.sendNotification);
router.post('/:id/archive', authMiddleware, requireAdmin, userAdminController.archive);
router.post('/:id/unarchive', authMiddleware, requireAdmin, userAdminController.unarchive);
router.put('/:id/manager', authMiddleware, requireManager, userAdminController.setManager);
router.put('/:id/organization', authMiddleware, requireManager, userAdminController.setOrganization);
router.put('/:id/lifecycle-status', authMiddleware, requireManager, userAdminController.setLifecycleStatus);

// What a user still holds, and handing it to somebody else. Both must come
// before the :id routes below so 'workload' is not read as an id.
router.get('/:id/workload', authMiddleware, userController.getUserWorkload);
router.put('/:id/reassign', authMiddleware, requireManager, userController.reassignUserWork);
router.delete('/:id', authMiddleware, requireSuperAdmin, userController.deleteUser);

// Read routes. Everything here is signed in: the user list and search
// expose usernames, emails and login metadata, and the single-user lookups
// feed the profile screens. (The login screen itself needs no user lookup —
// it posts credentials to /api/auth/login, which is open.)
router.get('/', authMiddleware, userController.getUsers);
router.get('/search', authMiddleware, userController.searchUsers);
router.get('/username/:username', authMiddleware, userController.getUserByUsername);
router.get('/:id', authMiddleware, userController.getUserById);

module.exports = router;
