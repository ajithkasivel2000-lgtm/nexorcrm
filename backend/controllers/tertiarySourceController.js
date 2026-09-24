const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');

exports.getSources = async (req, res) => {
  try {
    const sources = await prisma.tertiarySource.findMany();
    const mapped = sources.map(s => ({ ...s, sourceId: s.id }));
    res.status(200).json(mapped);
  } catch (error) {
    sendError(res, error, 'Error fetching', 500);
  }
};

exports.createSource = async (req, res) => {
  try {
    const source = await prisma.tertiarySource.create({ data: { ...req.body } });
    res.status(201).json(source);
  } catch (error) {
    sendError(res, error, 'Error creating', 400);
  }
};

exports.updateSource = async (req, res) => {
  try {
    const source = await prisma.tertiarySource.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(source);
  } catch (error) {
    sendError(res, error, 'Error updating', 400);
  }
};

exports.deleteSource = async (req, res) => {
  try {
    await prisma.tertiarySource.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    sendError(res, error, 'Error deleting', 500);
  }
};