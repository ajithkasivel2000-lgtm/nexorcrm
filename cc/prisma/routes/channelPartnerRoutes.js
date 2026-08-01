const express = require('express');
const router = express.Router();
const channelPartnerController = require('../controllers/channelPartnerController');

router.post('/', channelPartnerController.createChannelPartner);
router.get('/', channelPartnerController.getChannelPartners);
router.get('/:id', channelPartnerController.getChannelPartnerById);
router.put('/:id', channelPartnerController.updateChannelPartner);
router.delete('/:id', channelPartnerController.deleteChannelPartner);

module.exports = router;
