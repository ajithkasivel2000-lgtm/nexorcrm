const express = require('express');
const router = express.Router();
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');
const leadStatusController = require('../controllers/leadStatusController');

router.get('/', authMiddleware, leadStatusController.getStatuses);
router.post('/', authMiddleware, leadStatusController.createStatus);
router.put('/:id', authMiddleware, leadStatusController.updateStatus);
router.delete('/:id', authMiddleware, requireSuperAdmin, leadStatusController.deleteStatus);

module.exports = router;
