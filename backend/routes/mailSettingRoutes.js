const express = require('express');
const router = express.Router();
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const mailSettingController = require('../controllers/mailSettingController');

// The SMTP credentials live in this table, so reads are signed in too.
router.get('/', authMiddleware, requireAdmin, mailSettingController.getSettings);
router.put('/', authMiddleware, requireAdmin, mailSettingController.updateSettings);
router.post('/test', authMiddleware, requireAdmin, mailSettingController.sendTestEmail);

module.exports = router;
