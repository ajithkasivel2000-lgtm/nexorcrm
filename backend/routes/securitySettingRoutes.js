const express = require('express');
const router = express.Router();
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const securitySettingController = require('../controllers/securitySettingController');

router.get('/', authMiddleware, requireAdmin, securitySettingController.getSettings);
router.put('/', authMiddleware, requireAdmin, securitySettingController.updateSettings);
module.exports = router;
