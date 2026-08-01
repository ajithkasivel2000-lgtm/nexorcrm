const prisma = require('../prismaClient');

exports.getStatuses = async (req, res) => {
  try {
    const statuses = await prisma.projectStatus.findMany();
    const mapped = statuses.map(s => ({ ...s, statusId: 'PRJSTS_' + s.id }));
    res.status(200).json(mapped);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching statuses', error: error.message });
  }
};

exports.createStatus = async (req, res) => {
  try {
    const status = await prisma.projectStatus.create({ data: req.body });
    res.status(201).json(status);
  } catch (error) {
    res.status(400).json({ message: 'Error creating status', error: error.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const status = await prisma.projectStatus.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(status);
  } catch (error) {
    res.status(400).json({ message: 'Error updating status', error: error.message });
  }
};

exports.deleteStatus = async (req, res) => {
  try {
    await prisma.projectStatus.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting status', error: error.message });
  }
};