const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');

exports.getStatuses = async (req, res) => {
  try {
    const statuses = await prisma.leadStatus.findMany();
    const mapped = statuses.map(s => ({ ...s, statusId: s.id }));
    res.status(200).json(mapped);
  } catch (error) {
    sendError(res, error, 'Error fetching statuses', 500);
  }
};

exports.createStatus = async (req, res) => {
  try {
    const status = await prisma.leadStatus.create({ data: { ...req.body } });
    res.status(201).json(status);
  } catch (error) {
    sendError(res, error, 'Error creating status', 400);
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const status = await prisma.leadStatus.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(status);
  } catch (error) {
    sendError(res, error, 'Error updating status', 400);
  }
};

exports.deleteStatus = async (req, res) => {
  try {
    await prisma.leadStatus.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    sendError(res, error, 'Error deleting status', 500);
  }
};