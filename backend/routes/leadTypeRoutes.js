const express = require('express');
const router = express.Router();
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');
const leadTypeController = require('../controllers/leadTypeController');

router.get('/', authMiddleware, leadTypeController.getTypes);
router.post('/', authMiddleware, leadTypeController.createType);
router.put('/:id', authMiddleware, leadTypeController.updateType);
router.delete('/:id', authMiddleware, requireSuperAdmin, leadTypeController.deleteType);

module.exports = router;
