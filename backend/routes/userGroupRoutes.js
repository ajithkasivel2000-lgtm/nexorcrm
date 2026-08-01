const express = require('express');
const router = express.Router();
const userGroupController = require('../controllers/userGroupController');

// router.post('/seed', userGroupController.seedGroups);
router.post('/:id/members', userGroupController.addMember);
router.delete('/:id/members/:userId', userGroupController.removeMember);

router.get('/', userGroupController.getUserGroups);
router.post('/', userGroupController.createUserGroup);
router.put('/:id', userGroupController.updateUserGroup);
router.delete('/:id', userGroupController.deleteUserGroup);

module.exports = router;
