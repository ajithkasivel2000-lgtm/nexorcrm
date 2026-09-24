const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Reads are open to any signed-in user: department dropdowns appear across the CRM.
router.get('/', authMiddleware, departmentController.list);

/* Writes are for administrators, checked against the caller's own row.
   authMiddleware has to run here too, not only on the GET above: a route-level
   middleware list applies to that one route, so without it req.user was
   undefined by the time this gate read it and every write — an admin's
   included — was refused with 403. */
router.use(authMiddleware, (req, res, next) => {
  const u = req.user;
  const isAdmin = u && (u.username === 'admin' || u.status === 'Admin' || (u.userlevel || 0) >= 8);
  if (!isAdmin) return res.status(403).json({ message: 'Only administrators can manage departments.' });
  return next();
});
router.post('/', departmentController.create);
router.put('/:id', departmentController.update);
router.delete('/:id', departmentController.remove);

module.exports = router;
