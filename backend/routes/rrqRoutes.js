const express = require('express');
const router = express.Router();
const { authMiddleware, requireManager, requireSuperAdmin } = require('../middleware/authMiddleware');
const { requirePermission } = require('../utils/permissions');
const rrqController = require('../controllers/rrqController');

router.post('/', authMiddleware, requireManager, requirePermission('rrq', 'create'), rrqController.createRRQ);
router.get('/health', authMiddleware, rrqController.health);
router.get('/', authMiddleware, rrqController.getRRQs);
router.put('/:id', authMiddleware, requireManager, requirePermission('rrq', 'edit'), rrqController.updateRRQ);
router.delete('/:id', authMiddleware, requireSuperAdmin, rrqController.deleteRRQ);

module.exports = router;
