const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const { requirePermission } = require('../utils/permissions');
const c = require('../controllers/chatRoomController');

// Everything here is somebody's private conversation, so all of it is signed in.
router.get('/contacts', authMiddleware, c.contacts);
router.get('/unread', authMiddleware, c.unreadTotal);

router.get('/rooms', authMiddleware, requirePermission('team-chat', 'view'), c.listRooms);
router.post('/rooms', authMiddleware, requirePermission('team-chat', 'view'), c.createRoom);
router.get('/rooms/:id', authMiddleware, requirePermission('team-chat', 'view'), c.getRoom);
router.patch('/rooms/:id', authMiddleware, requirePermission('team-chat', 'view'), c.renameRoom);
router.delete('/rooms/:id', authMiddleware, requirePermission('team-chat', 'view'), c.deleteRoom);

router.get('/rooms/:id/messages', authMiddleware, requirePermission('team-chat', 'view'), c.listMessages);
router.post('/rooms/:id/messages', authMiddleware, requirePermission('team-chat', 'view'), c.sendMessage);
router.post('/rooms/:id/read', authMiddleware, requirePermission('team-chat', 'view'), c.markRead);

router.post('/rooms/:id/members', authMiddleware, requirePermission('team-chat', 'view'), c.addMembers);
router.delete('/rooms/:id/members/:username', authMiddleware, requirePermission('team-chat', 'view'), c.removeMember);

module.exports = router;
