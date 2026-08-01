const prisma = require('../prismaClient');

exports.getTypes = async (req, res) => {
  try {
    const types = await prisma.leadType.findMany();
    const mapped = types.map(t => ({ ...t, typeId: 'LEADTP_' + t.id }));
    res.status(200).json(mapped);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching types', error: error.message });
  }
};

exports.createType = async (req, res) => {
  try {
    const type = await prisma.leadType.create({ data: req.body });
    res.status(201).json(type);
  } catch (error) {
    res.status(400).json({ message: 'Error creating type', error: error.message });
  }
};

exports.updateType = async (req, res) => {
  try {
    const type = await prisma.leadType.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(type);
  } catch (error) {
    res.status(400).json({ message: 'Error updating type', error: error.message });
  }
};

exports.deleteType = async (req, res) => {
  try {
    await prisma.leadType.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting type', error: error.message });
  }
};