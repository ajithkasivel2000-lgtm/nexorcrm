const express = require('express');
const router = express.Router();
const enquiryController = require('../controllers/enquiryController');

// Route to create a new enquiry
router.post('/', enquiryController.createEnquiry);

// Route to get all enquiries
router.get('/', enquiryController.getEnquiries);

// Route to get a specific enquiry by ID
router.get('/:id', enquiryController.getEnquiryById);

// Route to delete an enquiry
router.delete('/:id', enquiryController.deleteEnquiry);

module.exports = router;
