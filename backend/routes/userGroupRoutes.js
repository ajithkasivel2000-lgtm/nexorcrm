const express = require('express');
const router = express.Router();
const userGroupController = require('../controllers/userGroupController');
const { authMiddleware, requireManager, requireSuperAdmin } = require('../middleware/authMiddleware');

// router.post('/seed', authMiddleware, userGroupController.seedGroups);
router.post('/:id/members', authMiddleware, requireManager, userGroupController.addMember);
router.delete('/:id/members/:userId', authMiddleware, requireManager, userGroupController.removeMember);

router.get('/', authMiddleware, userGroupController.getUserGroups);
router.post('/', authMiddleware, requireManager, userGroupController.createUserGroup);
router.put('/:id', authMiddleware, requireManager, userGroupController.updateUserGroup);
router.delete('/:id', authMiddleware, requireSuperAdmin, userGroupController.deleteUserGroup);

module.exports = router;
