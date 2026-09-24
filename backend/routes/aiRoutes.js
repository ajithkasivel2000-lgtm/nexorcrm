const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireLeadAccess } = require('../middleware/leadAccess');
const { requirePermission } = require('../utils/permissions');
const aiController = require('../controllers/aiController');

// Whether AI is configured — read by the UI to decide if it shows AI entry
// points at all. Cheap and safe, so it stays open.
router.get('/status', aiController.status);

// Everything that spends tokens requires a signed-in user.
router.post('/search', authMiddleware, requirePermission('assistant', 'view'), aiController.searchLeads);
router.post('/ask', authMiddleware, requirePermission('assistant', 'view'), aiController.ask);
router.get('/leads/:id/summary', authMiddleware, requireLeadAccess, aiController.summarizeLead);

module.exports = router;
