const express = require('express');
const router = express.Router();
const { authMiddleware, requireSuperAdmin, requireAdmin } = require('../middleware/authMiddleware');
const { requirePermission } = require('../utils/permissions');
const c = require('../controllers/bookingController');

const view = requirePermission('bookings', 'view');
const create = requirePermission('bookings', 'create');
const edit = requirePermission('bookings', 'edit');

router.get('/plans', authMiddleware, view, c.plans);
router.get('/collections', authMiddleware, view, c.collections);
router.get('/', authMiddleware, view, c.list);
router.get('/:id', authMiddleware, view, c.get);
router.post('/', authMiddleware, create, c.create);
router.put('/:id', authMiddleware, edit, c.update);
router.post('/:id/cancel', authMiddleware, edit, c.cancel);
router.post('/:id/payments', authMiddleware, edit, c.addPayment);
// Removing money from the ledger is the one undoable-looking thing that is not.
router.delete('/:id/payments/:paymentId', authMiddleware, requireSuperAdmin, c.deletePayment);
router.put('/:id/commission', authMiddleware, requireAdmin, c.updateCommission);

module.exports = router;
