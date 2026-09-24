const express = require('express');
const router = express.Router();
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');
const secondarySourceController = require('../controllers/secondarySourceController');

router.get('/', authMiddleware, secondarySourceController.getSources);
router.post('/', authMiddleware, secondarySourceController.createSource);
router.put('/:id', authMiddleware, secondarySourceController.updateSource);
router.delete('/:id', authMiddleware, requireSuperAdmin, secondarySourceController.deleteSource);

module.exports = router;
