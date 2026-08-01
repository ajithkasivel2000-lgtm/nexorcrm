const prisma = require('../prismaClient');

exports.createChannelPartner = async (req, res) => {
  try {
    const cpId = 'CP_' + Math.random().toString(36).substr(2, 8);
    const cp = await prisma.channelPartner.create({ data: { ...req.body, cpId } });
    res.status(201).json(cp);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create channel partner', error: error.message });
  }
};

exports.getChannelPartners = async (req, res) => {
  try {
    const cps = await prisma.channelPartner.findMany({ orderBy: { createdAt: 'desc' } });
    res.status(200).json(cps);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch channel partners', error: error.message });
  }
};

exports.getChannelPartnerById = async (req, res) => {
  try {
    const cp = await prisma.channelPartner.findUnique({ where: { id: req.params.id } });
    if (!cp) return res.status(404).json({ message: 'Not found' });
    res.status(200).json(cp);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch', error: error.message });
  }
};

exports.updateChannelPartner = async (req, res) => {
  try {
    const cp = await prisma.channelPartner.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(cp);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update', error: error.message });
  }
};

exports.deleteChannelPartner = async (req, res) => {
  try {
    await prisma.channelPartner.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete', error: error.message });
  }
};