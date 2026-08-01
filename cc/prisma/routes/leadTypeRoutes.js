const express = require('express');
const router = express.Router();
const leadTypeController = require('../controllers/leadTypeController');

router.get('/', leadTypeController.getTypes);
router.post('/', leadTypeController.createType);
router.put('/:id', leadTypeController.updateType);
router.delete('/:id', leadTypeController.deleteType);

module.exports = router;
