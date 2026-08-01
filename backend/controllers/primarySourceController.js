const prisma = require('../prismaClient');

exports.getSources = async (req, res) => {
  try {
    const sources = await prisma.primarySource.findMany();
    const mapped = sources.map(s => ({ ...s, sourceId: s.id }));
    res.status(200).json(mapped);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching', error: error.message });
  }
};

exports.createSource = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const prefix = `PRISO-${currentYear}-`;

    const lastThisYear = await prisma.primarySource.findFirst({
      where: { id: { startsWith: prefix } },
      orderBy: { id: 'desc' }
    });

    let nextNumber = 1;
    if (lastThisYear && lastThisYear.id) {
      const lastNumberStr = lastThisYear.id.split('-').pop();
      const lastNumber = parseInt(lastNumberStr, 10);
      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }

    const sourceId = `${prefix}${String(nextNumber).padStart(6, '0')}`;
    const source = await prisma.primarySource.create({ data: { ...req.body, id: sourceId } });
    res.status(201).json(source);
  } catch (error) {
    res.status(400).json({ message: 'Error creating', error: error.message });
  }
};

exports.updateSource = async (req, res) => {
  try {
    const source = await prisma.primarySource.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(source);
  } catch (error) {
    res.status(400).json({ message: 'Error updating', error: error.message });
  }
};

exports.deleteSource = async (req, res) => {
  try {
    await prisma.primarySource.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting', error: error.message });
  }
};