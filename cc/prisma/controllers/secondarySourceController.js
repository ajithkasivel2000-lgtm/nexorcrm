const prisma = require('../prismaClient');

exports.getSources = async (req, res) => {
  try {
    const sources = await prisma.secondarySource.findMany();
    const mapped = sources.map(s => ({ ...s, sourceId: 'SECSO_' + s.id }));
    res.status(200).json(mapped);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching', error: error.message });
  }
};

exports.createSource = async (req, res) => {
  try {
    const source = await prisma.secondarySource.create({ data: req.body });
    res.status(201).json(source);
  } catch (error) {
    res.status(400).json({ message: 'Error creating', error: error.message });
  }
};

exports.updateSource = async (req, res) => {
  try {
    const source = await prisma.secondarySource.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(source);
  } catch (error) {
    res.status(400).json({ message: 'Error updating', error: error.message });
  }
};

exports.deleteSource = async (req, res) => {
  try {
    await prisma.secondarySource.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting', error: error.message });
  }
};