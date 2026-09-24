const express = require('express');
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const c = require('../controllers/billingController');

/** /api/billing — a company's own administrators. */
const router = express.Router();
router.use(authMiddleware, requireAdmin);
router.get('/', c.overview);
router.put('/details', c.updateDetails);
router.post('/subscribe', c.subscribe);
router.post('/verify', c.verify);
router.post('/cancel', c.cancel);

module.exports = router;
