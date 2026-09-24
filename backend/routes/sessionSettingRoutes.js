const express = require('express');
const router = express.Router();
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const sessionSettingController = require('../controllers/sessionSettingController');

router.get('/', authMiddleware, requireAdmin, sessionSettingController.getSettings);
router.put('/', authMiddleware, requireAdmin, sessionSettingController.updateSettings);
module.exports = router;
