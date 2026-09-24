const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const notificationController = require('../controllers/notificationController');

router.get('/', authMiddleware, notificationController.list);
router.post('/read-all', authMiddleware, notificationController.markAllRead);
router.post('/:id/read', authMiddleware, notificationController.markRead);

module.exports = router;
