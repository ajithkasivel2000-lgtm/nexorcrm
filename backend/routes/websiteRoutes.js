const express = require('express');
const router = express.Router();
const { rateLimit } = require('../middleware/rateLimit');
// Public: room for ad platforms posting from one IP, not for a flood.
const leadLimit = rateLimit('public-lead', { max: 120, windowMs: 60 * 60 * 1000 });
const { requireCompanyKey } = require('../middleware/companyKey');
const leadController = require('../controllers/leadController');
const branding = require('../controllers/brandingController');

// Public endpoint for website forms to submit leads (POST - no auth required)
router.post('/leads', leadLimit, requireCompanyKey, leadController.websiteLead);

// Public endpoint for campaign leads via GET (no auth required)
// External websites/forms can use a simple URL with query params
// Example: /api/public/campaign-leads?key=<company key>&name=John&mobile=1234567890&email=john@example.com&project=ProjectX&source=Facebook
router.get('/campaign-leads', leadLimit, requireCompanyKey, leadController.campaignLead);

// Start a free trial: a new company and its first administrator.
router.post('/companies', rateLimit('company-signup', { max: 5, windowMs: 60 * 60 * 1000 }), branding.signup);
// A company's name, colour and logo for its sign-in page (?company=slug).
router.get('/branding', branding.publicBranding);
// The plans on offer, for the free-trial form.
router.get('/plans', branding.publicPlans);
router.get('/branding/logo/:id',    branding.logo);
router.get('/branding/icon/:id',    branding.icon);
router.get('/branding/favicon/:id', branding.favicon);
// Caddy's on-demand TLS asks here before issuing a cert: 200 if we recognise
// the Host (platform or an active company's customDomain), 404 otherwise.
router.get('/branding/allow-host', branding.allowHost);

module.exports = router;
