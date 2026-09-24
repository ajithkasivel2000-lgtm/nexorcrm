const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');

exports.createLeads = async (req, res) => {
  try {
    const Leads = await prisma.Leads.create({ data: req.body });
    res.status(201).json(Leads);
  } catch (error) {
    sendError(res, error, 'Failed to create Leads', 500);
  }
};

exports.getEnquiries = async (req, res) => {
  try {
    const enquiries = await prisma.Leads.findMany({ orderBy: { updatedAt: 'desc' } });
    res.status(200).json(enquiries);
  } catch (error) {
    sendError(res, error, 'Failed to fetch enquiries', 500);
  }
};

exports.getLeadsById = async (req, res) => {
  try {
    const Leads = await prisma.Leads.findUnique({ where: { id: req.params.id } });
    if (!Leads) return res.status(404).json({ message: 'Not found' });
    res.status(200).json(Leads);
  } catch (error) {
    sendError(res, error, 'Failed to fetch', 500);
  }
};

exports.updateLeads = async (req, res) => {
  try {
    const Leads = await prisma.Leads.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(Leads);
  } catch (error) {
    sendError(res, error, 'Failed to update', 500);
  }
};

exports.deleteLeads = async (req, res) => {
  try {
    await prisma.Leads.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    sendError(res, error, 'Failed to delete', 500);
  }
};