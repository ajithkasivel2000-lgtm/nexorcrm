const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');

exports.getTypes = async (req, res) => {
  try {
    const types = await prisma.projectType.findMany();
    const mapped = types.map(t => ({ ...t, typeId: t.id }));
    res.status(200).json(mapped);
  } catch (error) {
    sendError(res, error, 'Error fetching types', 500);
  }
};

exports.createType = async (req, res) => {
  try {

    const type = await prisma.projectType.create({ data: { ...req.body } });
    res.status(201).json(type);
  } catch (error) {
    sendError(res, error, 'Error creating type', 400);
  }
};

exports.updateType = async (req, res) => {
  try {
    const type = await prisma.projectType.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(type);
  } catch (error) {
    sendError(res, error, 'Error updating type', 400);
  }
};

exports.deleteType = async (req, res) => {
  try {
    await prisma.projectType.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    sendError(res, error, 'Error deleting type', 500);
  }
};