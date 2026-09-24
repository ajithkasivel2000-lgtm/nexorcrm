const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const { rateLimit } = require('../middleware/rateLimit');
const c = require('../controllers/calendarController');

router.get('/link', authMiddleware, c.getLink);
router.post('/link/rotate', authMiddleware, c.rotateLink);
// Calendar apps poll this without signing in; the token in the URL is the key.
router.get('/feed/:token', rateLimit('calendar-feed', { max: 120, windowMs: 60 * 60 * 1000 }), c.feed);

module.exports = router;
