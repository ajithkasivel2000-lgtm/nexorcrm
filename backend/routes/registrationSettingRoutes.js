const express = require('express');
const router = express.Router();
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const registrationSettingController = require('../controllers/registrationSettingController');

router.get('/', authMiddleware, requireAdmin, registrationSettingController.getSettings);
router.put('/', authMiddleware, requireAdmin, registrationSettingController.updateSettings);
module.exports = router;
