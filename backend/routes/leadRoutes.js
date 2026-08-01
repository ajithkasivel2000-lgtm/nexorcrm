const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');

// Route to create a new lead
router.post('/', leadController.createLead);

// Route to import leads in bulk from CSV
router.post('/import', leadController.importLeads);

// Route to get all leads
router.get('/', leadController.getLeads);

// Route to get distinct SV status values from the database
router.get('/sv-statuses', leadController.getSvStatuses);

// Route to get a specific lead by ID
router.get('/:id', leadController.getLeadById);

// Route to update a lead's status (and other details)
router.put('/:id/status', leadController.updateLeadStatus);

// In case we want a full update route later
router.put('/:id', leadController.updateLeadStatus);

// Route to delete a lead
router.delete('/:id', leadController.deleteLead);

module.exports = router;
