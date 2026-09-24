const express = require('express');
const router = express.Router();
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const reminderSettingController = require('../controllers/reminderSettingController');

/* Reading is open to anyone signed in — a screen may want to say when a
   reminder will arrive. Changing the timings for the whole CRM is an
   administrator's job, gated by the same guard the other settings-level
   writes use rather than a new rule. */
router.get('/', authMiddleware, requireAdmin, reminderSettingController.getSettings);
router.put('/', authMiddleware, requireAdmin, reminderSettingController.updateSettings);

module.exports = router;
