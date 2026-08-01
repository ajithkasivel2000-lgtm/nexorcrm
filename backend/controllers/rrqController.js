const prisma = require('../prismaClient');

exports.createRRQ = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const prefix = `RRQ-${currentYear}-`;
    
    const lastRRQThisYear = await prisma.rRQ.findFirst({
      where: { rrqId: { startsWith: prefix } },
      orderBy: { rrqId: 'desc' }
    });

    let nextNumber = 1;
    if (lastRRQThisYear && lastRRQThisYear.rrqId) {
      const lastNumberStr = lastRRQThisYear.rrqId.split('-').pop();
      const lastNumber = parseInt(lastNumberStr, 10);
      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }
    
    const rrqId = `${prefix}${String(nextNumber).padStart(6, '0')}`;
    const rrq = await prisma.rRQ.create({ data: { ...req.body, rrqId } });
    res.status(201).json(rrq);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create RRQ', error: error.message });
  }
};

exports.getRRQs = async (req, res) => {
  try {
    const rrqs = await prisma.rRQ.findMany({ orderBy: { createdAt: 'desc' } });
    res.status(200).json(rrqs);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch RRQs', error: error.message });
  }
};

exports.updateRRQ = async (req, res) => {
  try {
    const rrq = await prisma.rRQ.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(rrq);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update', error: error.message });
  }
};

exports.deleteRRQ = async (req, res) => {
  try {
    await prisma.rRQ.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete', error: error.message });
  }
};