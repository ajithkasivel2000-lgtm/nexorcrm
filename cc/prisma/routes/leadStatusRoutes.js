const express = require('express');
const router = express.Router();
const leadStatusController = require('../controllers/leadStatusController');

router.get('/', leadStatusController.getStatuses);
router.post('/', leadStatusController.createStatus);
router.put('/:id', leadStatusController.updateStatus);
router.delete('/:id', leadStatusController.deleteStatus);

module.exports = router;
