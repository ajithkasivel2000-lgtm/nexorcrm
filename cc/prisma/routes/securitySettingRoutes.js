const express = require('express');
const router = express.Router();
const securitySettingController = require('../controllers/securitySettingController');

router.get('/', securitySettingController.getSettings);
router.put('/', securitySettingController.updateSettings);

module.exports = router;
