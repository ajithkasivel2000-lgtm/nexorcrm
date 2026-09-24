const express = require('express');
const router = express.Router();
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');
const controller = require('../controllers/openReasonController');

router.get('/', authMiddleware, controller.getAll);
router.post('/', authMiddleware, controller.create);
router.put('/:id', authMiddleware, controller.update);
router.delete('/:id', authMiddleware, requireSuperAdmin, controller.remove);

module.exports = router;
