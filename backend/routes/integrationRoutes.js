const express = require('express');
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const { requireLeadAccess } = require('../middleware/leadAccess');
const { rateLimit } = require('../middleware/rateLimit');
const integrations = require('../controllers/integrationController');
const comms = require('../controllers/commsController');
const webhooks = require('../controllers/webhookController');

/** /api/integrations — Settings → Integrations, administrators only. */
const settings = express.Router();
settings.use(authMiddleware, requireAdmin);
settings.get('/whatsapp', integrations.getWhatsApp);
settings.put('/whatsapp', integrations.updateWhatsApp);
settings.post('/whatsapp/test', integrations.testWhatsApp);
settings.get('/exotel', integrations.getExotel);
settings.put('/exotel', integrations.updateExotel);
settings.get('/lead-sources', integrations.listLeadIntegrations);
settings.post('/lead-sources', integrations.createLeadIntegration);
settings.put('/lead-sources/:id', integrations.updateLeadIntegration);
settings.delete('/lead-sources/:id', integrations.deleteLeadIntegration);
settings.get('/reports', integrations.listReports);
settings.post('/reports', integrations.createReport);
settings.put('/reports/:id', integrations.updateReport);
settings.delete('/reports/:id', integrations.deleteReport);
settings.post('/reports/:id/send', integrations.sendReportNow);
settings.get('/email-log', integrations.emailLog);

/** /api/leads/:id/... — WhatsApp and calls, for whoever may open the lead. */
const leadComms = express.Router({ mergeParams: true });
const sendLimit = rateLimit('lead-comms', { max: 60, windowMs: 60 * 1000 });
leadComms.get('/:id/whatsapp', authMiddleware, requireLeadAccess, comms.whatsappThread);
leadComms.post('/:id/whatsapp', authMiddleware, sendLimit, requireLeadAccess, comms.sendWhatsApp);
leadComms.get('/:id/calls', authMiddleware, requireLeadAccess, comms.callHistory);
leadComms.post('/:id/call', authMiddleware, sendLimit, requireLeadAccess, comms.placeCall);

/** /api/webhooks — Meta, Google and Exotel call these; each verifies itself. */
const hooks = express.Router();
const hookLimit = rateLimit('webhooks', { max: 600, windowMs: 60 * 1000 });
hooks.get('/meta', hookLimit, webhooks.metaVerify);
hooks.post('/meta', hookLimit, webhooks.metaEvent);
hooks.post('/google-leads/:key', hookLimit, webhooks.googleLead);
hooks.post('/razorpay', hookLimit, require('../controllers/billingController').webhook);
// Exotel posts form-encoded unless told otherwise.
hooks.post('/exotel/:callId', hookLimit, express.urlencoded({ extended: false }), webhooks.exotelStatus);

module.exports = { settings, leadComms, hooks };
