const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const c = require('../controllers/entityRecordController');

/*
 * Sub-records for a lead, an opportunity or a customer.
 *
 *   /api/records/:entityType/:entityId/:recordType
 *
 * Both kinds come off the URL and both are checked against a fixed list in the
 * controller before they reach the database.
 *
 * Everything here is customer data, so all of it is signed in.
 */
router.get('/:entityType/:entityId/counts', authMiddleware, c.counts);
// File uploads: before the generic routes, which would read 'upload' as an item id.
router.post('/:entityType/:entityId/documents/upload', authMiddleware, c.uploadDocument);

router.get('/:entityType/:entityId/:recordType', authMiddleware, c.list);
router.post('/:entityType/:entityId/:recordType', authMiddleware, c.create);
router.put('/:entityType/:entityId/:recordType/:itemId', authMiddleware, c.update);
router.delete('/:entityType/:entityId/:recordType/:itemId', authMiddleware, c.remove);

module.exports = router;
