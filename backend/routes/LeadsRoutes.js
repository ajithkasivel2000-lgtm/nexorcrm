const express = require('express');
const router = express.Router();
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');
const LeadsController = require('../controllers/LeadsController');

router.post('/', authMiddleware, LeadsController.createLeads);
// Enquiries are customer data — signed in.
router.get('/', authMiddleware, LeadsController.getEnquiries);
router.get('/:id', authMiddleware, LeadsController.getLeadsById);
router.put('/:id', authMiddleware, LeadsController.updateLeads);
router.delete('/:id', authMiddleware, requireSuperAdmin, LeadsController.deleteLeads);

module.exports = router;
