const express = require('express');
const router = express.Router();
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');
const primarySourceController = require('../controllers/primarySourceController');

router.get('/', authMiddleware, primarySourceController.getSources);
router.post('/', authMiddleware, primarySourceController.createSource);
router.put('/:id', authMiddleware, primarySourceController.updateSource);
router.delete('/:id', authMiddleware, requireSuperAdmin, primarySourceController.deleteSource);

module.exports = router;
