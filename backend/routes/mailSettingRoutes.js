const express = require('express');
const router = express.Router();
const mailSettingController = require('../controllers/mailSettingController');

router.get('/', mailSettingController.getSettings);
router.put('/', mailSettingController.updateSettings);
router.post('/test', mailSettingController.sendTestEmail);

module.exports = router;
