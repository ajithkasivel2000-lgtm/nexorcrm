const express = require('express');
const router = express.Router();
const { authMiddleware, requireAdmin, requireSuperAdmin, isManagerUser } = require('../middleware/authMiddleware');
const logController = require('../controllers/logController');

// Login history carries usernames and ip addresses — signed in.
router.get('/', authMiddleware, requireAdmin, logController.getLogs);
// A person's own activity is theirs to see; anyone else's needs a manager.
const selfOrManager = (req, res, next) => (
  req.user.username === req.params.username || isManagerUser(req.user)
    ? next()
    : res.status(403).json({ message: 'You do not have permission to view these logs.' })
);
router.get('/user/:username', authMiddleware, selfOrManager, logController.getLogsByUser);
router.delete('/all', authMiddleware, requireSuperAdmin, logController.deleteAllLogs);
router.delete('/old', authMiddleware, requireSuperAdmin, logController.deleteOldLogs);

module.exports = router;
