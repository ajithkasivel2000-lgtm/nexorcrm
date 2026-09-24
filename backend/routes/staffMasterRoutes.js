const express = require('express');
const router = express.Router();
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');
const c = require('../controllers/staffMasterController');

/*
 * Staff master lists.
 *
 *   /api/staff-masters/designation
 *   /api/staff-masters/branch
 *   /api/staff-masters/location
 *
 * One set of routes for all three; :master picks the list and the controller
 * rejects anything not on its own fixed list, so the path cannot be used to
 * reach another table.
 *
 * Deleting is super-admin only, matching every other master in this app
 * (lead statuses, lead types, RRQ types). Adding is not: adding a branch from
 * the dropdown while filling a form is the whole point of an editable master.
 */
router.get('/:master', authMiddleware, c.list);
router.get('/:master/usage', authMiddleware, c.usage);
router.post('/:master', authMiddleware, c.create);
router.put('/:master/:id', authMiddleware, c.update);
router.delete('/:master/:id', authMiddleware, requireSuperAdmin, c.remove);

module.exports = router;
