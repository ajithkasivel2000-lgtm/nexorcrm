const express = require('express');
const router = express.Router();
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');
const { requirePermission } = require('../utils/permissions');
const channelPartnerController = require('../controllers/channelPartnerController');

router.post('/', authMiddleware, requirePermission('channel-partners', 'create'), channelPartnerController.createChannelPartner);
// Partners carry aadhaar, PAN and bank details — signed in.
router.get('/', authMiddleware, channelPartnerController.getChannelPartners);
router.get('/:id', authMiddleware, channelPartnerController.getChannelPartnerById);
router.put('/:id', authMiddleware, requirePermission('channel-partners', 'edit'), channelPartnerController.updateChannelPartner);
router.delete('/:id', authMiddleware, requirePermission('channel-partners', 'delete'), requireSuperAdmin, channelPartnerController.deleteChannelPartner);

module.exports = router;
