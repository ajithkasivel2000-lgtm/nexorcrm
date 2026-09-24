const express = require('express');
const router = express.Router();
const rrqTypeController = require('../controllers/rrqTypeController');
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');

router.get('/', authMiddleware, rrqTypeController.getTypes);
router.post('/', authMiddleware, rrqTypeController.createType);
router.delete('/:id', authMiddleware, requireSuperAdmin, rrqTypeController.deleteType);

module.exports = router;
