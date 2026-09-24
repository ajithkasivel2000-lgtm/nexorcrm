const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const { requirePermission } = require('../utils/permissions');
const chatController = require('../controllers/chatController');

// The opening prompts are the same for everyone and reveal nothing.
router.get('/suggestions', chatController.suggestions);

// Everything else is somebody's own conversation.
router.get('/conversations', authMiddleware, chatController.listConversations);
router.get('/conversations/:id', authMiddleware, chatController.getConversation);
router.delete('/conversations/:id', authMiddleware, chatController.remove);
router.post('/ask', authMiddleware, requirePermission('assistant', 'view'), chatController.ask);

module.exports = router;
