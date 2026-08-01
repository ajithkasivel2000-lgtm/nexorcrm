const express = require('express');
const router = express.Router();
const tertiarySourceController = require('../controllers/tertiarySourceController');

router.get('/', tertiarySourceController.getSources);
router.post('/', tertiarySourceController.createSource);
router.put('/:id', tertiarySourceController.updateSource);
router.delete('/:id', tertiarySourceController.deleteSource);

module.exports = router;
