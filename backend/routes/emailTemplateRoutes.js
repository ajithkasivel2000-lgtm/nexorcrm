const express = require('express');
const router = express.Router();
const emailTemplateController = require('../controllers/emailTemplateController');

router.get('/', emailTemplateController.getTemplates);
router.post('/', emailTemplateController.createTemplate);
router.put('/:id', emailTemplateController.updateTemplate);
router.delete('/:id', emailTemplateController.deleteTemplate);

module.exports = router;
