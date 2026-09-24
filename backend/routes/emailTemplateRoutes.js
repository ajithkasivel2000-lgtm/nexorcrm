const express = require('express');
const router = express.Router();
const { authMiddleware, requireAdmin, requireSuperAdmin } = require('../middleware/authMiddleware');
const emailTemplateController = require('../controllers/emailTemplateController');

router.get('/', authMiddleware, emailTemplateController.getTemplates);
router.post('/', authMiddleware, requireAdmin, emailTemplateController.createTemplate);
router.put('/:id', authMiddleware, requireAdmin, emailTemplateController.updateTemplate);
router.delete('/:id', authMiddleware, requireSuperAdmin, emailTemplateController.deleteTemplate);

module.exports = router;
