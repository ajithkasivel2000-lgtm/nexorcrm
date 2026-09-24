const express = require('express');
const router = express.Router();
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const globalUserSettingController = require('../controllers/globalUserSettingController');

router.get('/', authMiddleware, requireAdmin, globalUserSettingController.getSettings);
router.put('/', authMiddleware, requireAdmin, globalUserSettingController.updateSettings);
module.exports = router;
