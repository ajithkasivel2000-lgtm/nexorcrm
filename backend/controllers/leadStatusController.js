const prisma = require('../prismaClient');

exports.getStatuses = async (req, res) => {
  try {
    const statuses = await prisma.leadStatus.findMany();
    const mapped = statuses.map(s => ({ ...s, statusId: s.id }));
    res.status(200).json(mapped);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching statuses', error: error.message });
  }
};

exports.createStatus = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const prefix = `LEDSTS-${currentYear}-`;

    const lastThisYear = await prisma.leadStatus.findFirst({
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

    const statusId = `${prefix}${String(nextNumber).padStart(6, '0')}`;
    const status = await prisma.leadStatus.create({ data: { ...req.body, id: statusId } });
    res.status(201).json(status);
  } catch (error) {
    res.status(400).json({ message: 'Error creating status', error: error.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const status = await prisma.leadStatus.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(status);
  } catch (error) {
    res.status(400).json({ message: 'Error updating status', error: error.message });
  }
};

exports.deleteStatus = async (req, res) => {
  try {
    await prisma.leadStatus.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting status', error: error.message });
  }
};