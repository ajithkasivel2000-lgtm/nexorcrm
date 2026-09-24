const express = require('express');
const router = express.Router();
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const leadAssignmentSettingController = require('../controllers/leadAssignmentSettingController');

router.get('/', authMiddleware, requireAdmin, leadAssignmentSettingController.getSettings);
router.put('/', authMiddleware, requireAdmin, leadAssignmentSettingController.updateSettings);
module.exports = router;
