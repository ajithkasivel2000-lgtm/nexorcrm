const express = require('express');
const router = express.Router();
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');
const projectTypeController = require('../controllers/projectTypeController');

router.get('/', authMiddleware, projectTypeController.getTypes);
router.post('/', authMiddleware, projectTypeController.createType);
router.put('/:id', authMiddleware, projectTypeController.updateType);
router.delete('/:id', authMiddleware, requireSuperAdmin, projectTypeController.deleteType);

module.exports = router;
