const express = require('express');
const router = express.Router();
const secondarySourceController = require('../controllers/secondarySourceController');

router.get('/', secondarySourceController.getSources);
router.post('/', secondarySourceController.createSource);
router.put('/:id', secondarySourceController.updateSource);
router.delete('/:id', secondarySourceController.deleteSource);

module.exports = router;
