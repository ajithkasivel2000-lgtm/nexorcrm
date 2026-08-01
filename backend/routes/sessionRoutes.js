const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');

router.get('/', sessionController.getSessions);
router.get('/user/:username', sessionController.getSessionsByUser);
router.delete('/bulk', sessionController.deleteBulkSessions);
router.delete('/', sessionController.clearAllSessions);

module.exports = router;
