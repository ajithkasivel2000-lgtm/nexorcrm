const express = require('express');
const router = express.Router();
const { rateLimit } = require('../middleware/rateLimit');
// Public: room for ad platforms posting from one IP, not for a flood.
const leadLimit = rateLimit('public-lead', { max: 120, windowMs: 60 * 60 * 1000 });
const { requireCompanyKey } = require('../middleware/companyKey');
const leadController = require('../controllers/leadController');

// Public endpoint for website forms to submit leads (POST - no auth required)
router.post('/leads', leadLimit, requireCompanyKey, leadController.websiteLead);

// Public endpoint for campaign leads via GET (no auth required)
// External websites/forms can use a simple URL with query params
// Example: /api/public/campaign-leads?key=<company key>&name=John&mobile=1234567890&email=john@example.com&project=ProjectX&source=Facebook
router.get('/campaign-leads', leadLimit, requireCompanyKey, leadController.campaignLead);

module.exports = router;
