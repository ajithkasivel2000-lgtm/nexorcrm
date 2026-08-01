const express = require('express');
const router = express.Router();
const opportunityController = require('../controllers/opportunityController');

router.post('/', opportunityController.createOpportunity);
router.get('/', opportunityController.getOpportunities);
router.get('/:id', opportunityController.getOpportunityById);
router.put('/:id', opportunityController.updateOpportunity);
router.delete('/:id', opportunityController.deleteOpportunity);

module.exports = router;
