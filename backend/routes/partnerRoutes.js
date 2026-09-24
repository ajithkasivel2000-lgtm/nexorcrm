const express = require('express');
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const { rateLimit } = require('../middleware/rateLimit');
const c = require('../controllers/partnerController');

/** /api/partner — the channel partner portal (partner accounts). */
const portal = express.Router();
portal.use(authMiddleware);
portal.get('/me', c.me);
portal.get('/leads', c.leads);
portal.post('/leads', rateLimit('partner-leads', { max: 60, windowMs: 60 * 60 * 1000 }), c.submitLead);
portal.get('/commissions', c.commissions);

/** /api/partner-accounts — administrators create portal logins. */
const accounts = express.Router();
accounts.get('/:channelPartnerId', authMiddleware, requireAdmin, c.listAccounts);
accounts.post('/:channelPartnerId', authMiddleware, requireAdmin, c.createAccount);

module.exports = { portal, accounts };
