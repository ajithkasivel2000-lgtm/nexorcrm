const express = require('express');
const router = express.Router();
const rrqController = require('../controllers/rrqController');

router.post('/', rrqController.createRRQ);
router.get('/', rrqController.getRRQs);
router.put('/:id', rrqController.updateRRQ);
router.delete('/:id', rrqController.deleteRRQ);

module.exports = router;
