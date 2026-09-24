const express = require('express');
const router = express.Router();
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');
const projectStatusController = require('../controllers/projectStatusController');

router.get('/', authMiddleware, projectStatusController.getStatuses);
router.post('/', authMiddleware, projectStatusController.createStatus);
router.put('/:id', authMiddleware, projectStatusController.updateStatus);
router.delete('/:id', authMiddleware, requireSuperAdmin, projectStatusController.deleteStatus);

module.exports = router;
