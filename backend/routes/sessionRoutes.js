const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const { authMiddleware, requireManager, requireSuperAdmin } = require('../middleware/authMiddleware');

// Session rows carry ip addresses and user agents — signed in.
router.get('/', authMiddleware, requireManager, sessionController.getSessions);
router.get('/user/:username', authMiddleware, requireManager, sessionController.getSessionsByUser);
router.delete('/bulk', authMiddleware, requireSuperAdmin, sessionController.deleteBulkSessions);
router.delete('/', authMiddleware, requireSuperAdmin, sessionController.clearAllSessions);

module.exports = router;
