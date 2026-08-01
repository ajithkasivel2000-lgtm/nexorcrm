const prisma = require('../prismaClient');

exports.createOpportunity = async (req, res) => {
  try {
    const oppId = 'OPP_' + Math.random().toString(36).substr(2, 7);
    const opp = await prisma.opportunity.create({ data: { ...req.body, oppId } });
    res.status(201).json(opp);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create opportunity', error: error.message });
  }
};

exports.getOpportunities = async (req, res) => {
  try {
    const opps = await prisma.opportunity.findMany({ orderBy: { createdAt: 'desc' } });
    res.status(200).json(opps);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch opportunities', error: error.message });
  }
};

exports.getOpportunityById = async (req, res) => {
  try {
    const opp = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
    if (!opp) return res.status(404).json({ message: 'Not found' });
    res.status(200).json(opp);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch', error: error.message });
  }
};

exports.updateOpportunity = async (req, res) => {
  try {
    const opp = await prisma.opportunity.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(opp);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update', error: error.message });
  }
};

exports.deleteOpportunity = async (req, res) => {
  try {
    await prisma.opportunity.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete', error: error.message });
  }
};