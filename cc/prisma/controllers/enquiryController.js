const prisma = require('../prismaClient');

exports.createEnquiry = async (req, res) => {
  try {
    const enquiry = await prisma.enquiry.create({ data: req.body });
    res.status(201).json(enquiry);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create enquiry', error: error.message });
  }
};

exports.getEnquiries = async (req, res) => {
  try {
    const enquiries = await prisma.enquiry.findMany({ orderBy: { createdAt: 'desc' } });
    res.status(200).json(enquiries);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch enquiries', error: error.message });
  }
};

exports.getEnquiryById = async (req, res) => {
  try {
    const enquiry = await prisma.enquiry.findUnique({ where: { id: req.params.id } });
    if (!enquiry) return res.status(404).json({ message: 'Not found' });
    res.status(200).json(enquiry);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch', error: error.message });
  }
};

exports.deleteEnquiry = async (req, res) => {
  try {
    await prisma.enquiry.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete', error: error.message });
  }
};