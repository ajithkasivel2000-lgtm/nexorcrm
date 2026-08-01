const express = require('express');
const router = express.Router();
const registrationSettingController = require('../controllers/registrationSettingController');

router.get('/', registrationSettingController.getSettings);
router.put('/', registrationSettingController.updateSettings);

module.exports = router;
