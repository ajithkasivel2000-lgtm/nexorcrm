const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');

// Public endpoint for website forms to submit leads (POST - no auth required)
router.post('/leads', leadController.websiteLead);

// Public endpoint for campaign leads via GET (no auth required)
// External websites/forms can use a simple URL with query params
// Example: /api/public/campaign-leads?name=John&mobile=1234567890&email=john@example.com&project=ProjectX&source=Facebook
router.get('/campaign-leads', leadController.campaignLead);

module.exports = router;
