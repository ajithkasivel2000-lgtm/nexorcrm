const express = require('express');
const router = express.Router();
const logController = require('../controllers/logController');

router.get('/', logController.getLogs);
router.get('/user/:username', logController.getLogsByUser);
router.delete('/all', logController.deleteAllLogs);
router.delete('/old', logController.deleteOldLogs);

module.exports = router;
