const express = require('express');
const router = express.Router();
const projectTypeController = require('../controllers/projectTypeController');

router.get('/', projectTypeController.getTypes);
router.post('/', projectTypeController.createType);
router.put('/:id', projectTypeController.updateType);
router.delete('/:id', projectTypeController.deleteType);

module.exports = router;
