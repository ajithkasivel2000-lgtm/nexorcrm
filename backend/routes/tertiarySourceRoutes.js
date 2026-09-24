const express = require('express');
const router = express.Router();
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');
const tertiarySourceController = require('../controllers/tertiarySourceController');

router.get('/', authMiddleware, tertiarySourceController.getSources);
router.post('/', authMiddleware, tertiarySourceController.createSource);
router.put('/:id', authMiddleware, tertiarySourceController.updateSource);
router.delete('/:id', authMiddleware, requireSuperAdmin, tertiarySourceController.deleteSource);

module.exports = router;
