const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const pushController = require('../controllers/pushController');

// The public key is public by definition — a browser needs it before it can
// subscribe, which is before it has done anything else.
router.get('/public-key', pushController.getPublicKey);

router.post('/subscribe', authMiddleware, pushController.subscribe);
router.post('/unsubscribe', authMiddleware, pushController.unsubscribe);
router.post('/test', authMiddleware, pushController.sendTest);

module.exports = router;
