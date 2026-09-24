const express = require('express');
const router = express.Router();
const opportunityController = require('../controllers/opportunityController');
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');
const { requirePermission, requireAnyPermission } = require('../utils/permissions');

// Converting a lead creates its opportunity, so a lead editor may do it too.
router.post('/', authMiddleware, requireAnyPermission(['opportunities', 'create'], ['leads', 'edit']), opportunityController.createOpportunity);
// Customer data — signed in.
router.get('/', authMiddleware, requirePermission('opportunities', 'view'), opportunityController.getOpportunities);
router.get('/:id/summary', authMiddleware, requirePermission('opportunities', 'view'), opportunityController.getOpportunitySummary);
router.get('/:id', authMiddleware, requirePermission('opportunities', 'view'), opportunityController.getOpportunityById);
router.put('/:id', authMiddleware, requirePermission('opportunities', 'edit'), opportunityController.updateOpportunity);
router.delete('/:id', authMiddleware, requireSuperAdmin, opportunityController.deleteOpportunity);

module.exports = router;
