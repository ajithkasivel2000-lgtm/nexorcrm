const express = require('express');
const { rateLimit } = require('../middleware/rateLimit');
const { buyerAuth } = require('../utils/collections');
const c = require('../controllers/buyerController');

/** /api/buyer — the buyer portal. Buyers sign in with one-time links. */
const router = express.Router();
const linkLimit = rateLimit('buyer-link', { max: 5, windowMs: 10 * 60 * 1000 });
const signInLimit = rateLimit('buyer-sign-in', { max: 20, windowMs: 60 * 1000 });

router.post('/request-link', linkLimit, c.requestLink);
router.post('/sign-in', signInLimit, c.signIn);
router.post('/sign-out', buyerAuth, c.signOut);
router.get('/me', buyerAuth, c.me);
router.post('/bookings/:id/pay', buyerAuth, rateLimit('buyer-pay', { max: 20, windowMs: 60 * 1000 }), c.pay);
router.get('/documents/:id', buyerAuth, c.document);

module.exports = router;
