const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const { blockAllocatorEdits, requireLeadAccess } = require('../middleware/leadAccess');
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');
const { requirePermission } = require('../utils/permissions');

// Route to create a new lead (authenticated)
router.post('/', authMiddleware, requirePermission('leads', 'create'), leadController.createLead);

// Route to import leads in bulk from CSV
router.post('/import', authMiddleware, requirePermission('leads', 'create'), leadController.importLeads);

// Route to get all leads. Customer data — signed in.
router.get('/', authMiddleware, leadController.getLeads);

// Route to get distinct SV status values from the database
router.get('/sv-statuses', authMiddleware, leadController.getSvStatuses);

// Route to get a specific lead by ID. Customer data — signed in.
router.get('/:id', authMiddleware, requireLeadAccess, leadController.getLeadById);
// Derived figures for the score and health panels. Declared beside /:id,
// which would otherwise swallow it.
router.get('/:id/summary', authMiddleware, requireLeadAccess, leadController.getLeadSummary);

// Route to update a lead's status (and other details like site visit info)
router.put('/:id', authMiddleware, requirePermission('leads', 'edit'), requireLeadAccess, blockAllocatorEdits, leadController.updateLead);
router.put('/:id/status', authMiddleware, requirePermission('leads', 'edit'), requireLeadAccess, blockAllocatorEdits, leadController.updateLeadStatus);

// Route to update individual lead fields. No status change, but each edit is
// now written to the lead log — optionalAuth resolves who made it while still
// letting a caller without a username through.
router.put('/:id/fields', authMiddleware, requirePermission('leads', 'edit'), requireLeadAccess, blockAllocatorEdits, leadController.updateLeadFields);

// Route to delete a lead
router.delete('/:id', authMiddleware, requireSuperAdmin, leadController.deleteLead);

module.exports = router;
