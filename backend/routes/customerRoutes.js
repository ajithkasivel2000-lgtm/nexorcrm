const express = require('express');
const router = express.Router();
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');
const { requirePermission } = require('../utils/permissions');
const customerController = require('../controllers/customerController');

router.post('/', authMiddleware, requirePermission('customers', 'create'), customerController.createCustomer);
// Customer data — signed in.
router.get('/', authMiddleware, requirePermission('customers', 'view'), customerController.getCustomers);
router.get('/:id', authMiddleware, requirePermission('customers', 'view'), customerController.getCustomerById);
router.put('/:id', authMiddleware, requirePermission('customers', 'edit'), customerController.updateCustomer);
router.delete('/:id', authMiddleware, requireSuperAdmin, customerController.deleteCustomer);

module.exports = router;
