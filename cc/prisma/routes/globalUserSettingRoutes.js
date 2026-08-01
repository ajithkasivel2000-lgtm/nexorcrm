const express = require('express');
const router = express.Router();
const globalUserSettingController = require('../controllers/globalUserSettingController');

router.get('/', globalUserSettingController.getSettings);
router.put('/', globalUserSettingController.updateSettings);

module.exports = router;
