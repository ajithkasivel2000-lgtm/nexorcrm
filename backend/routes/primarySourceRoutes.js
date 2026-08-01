const express = require('express');
const router = express.Router();
const primarySourceController = require('../controllers/primarySourceController');

router.get('/', primarySourceController.getSources);
router.post('/', primarySourceController.createSource);
router.put('/:id', primarySourceController.updateSource);
router.delete('/:id', primarySourceController.deleteSource);

module.exports = router;
