const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const c = require('../controllers/siteVisitController');

/*
 * Site visits.
 *
 *   /api/site-visits/statuses
 *   /api/site-visits/lead/:leadId          list, schedule
 *   /api/site-visits/:visitId              confirm / reschedule / cancel / outcome
 *   /api/site-visits/:visitId/check-in
 *   /api/site-visits/:visitId/check-out
 *   /api/site-visits/:visitId/notifications
 *
 * All of it is customer data, so all of it is signed in — the same rule the
 * records API already applies.
 */
router.get('/statuses', authMiddleware, c.statuses);

router.get('/lead/:leadId', authMiddleware, c.list);
router.post('/lead/:leadId', authMiddleware, c.create);

router.put('/:visitId', authMiddleware, c.update);
router.post('/:visitId/check-in', authMiddleware, c.checkIn);
router.post('/:visitId/check-out', authMiddleware, c.checkOut);
router.get('/:visitId/notifications', authMiddleware, c.notifications);

module.exports = router;
