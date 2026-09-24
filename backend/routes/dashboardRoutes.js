const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const { requirePermission } = require('../utils/permissions');
const dashboardController = require('../controllers/dashboardController');

router.get('/', authMiddleware, requirePermission('dashboard', 'view'), dashboardController.getDashboardStats);

module.exports = router;
