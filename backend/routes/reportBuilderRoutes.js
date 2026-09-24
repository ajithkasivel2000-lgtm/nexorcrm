const express = require('express');
const { authMiddleware, requireManager } = require('../middleware/authMiddleware');
const { requirePermission } = require('../utils/permissions');
const c = require('../controllers/reportBuilderController');

const router = express.Router();
router.use(authMiddleware, requireManager, requirePermission('report', 'view'));
router.get('/schema', c.schema);
router.post('/run', c.run);
router.get('/saved', c.listSaved);
router.post('/saved', c.save);
router.put('/saved/:id', c.update);
router.delete('/saved/:id', c.remove);

module.exports = router;
