const express = require('express');
const router = express.Router();
const sessionSettingController = require('../controllers/sessionSettingController');

router.get('/', sessionSettingController.getSettings);
router.put('/', sessionSettingController.updateSettings);

module.exports = router;
