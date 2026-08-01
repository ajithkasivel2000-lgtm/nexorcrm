const prisma = require('../prismaClient');

exports.getTypes = async (req, res) => {
  try {
    const types = await prisma.projectType.findMany();
    const mapped = types.map(t => ({ ...t, typeId: t.id.startsWith('PRJTP') ? t.id : 'PRJTP_' + t.id }));
    res.status(200).json(mapped);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching types', error: error.message });
  }
};

exports.createType = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const prefix = `PRJTP-${currentYear}-`;
    
    const lastTypeThisYear = await prisma.projectType.findFirst({
      where: { id: { startsWith: prefix } },
      orderBy: { id: 'desc' }
    });

    let nextNumber = 1;
    if (lastTypeThisYear && lastTypeThisYear.id) {
      const lastNumberStr = lastTypeThisYear.id.split('-').pop();
      const lastNumber = parseInt(lastNumberStr, 10);
      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }
    
    const typeId = `${prefix}${String(nextNumber).padStart(6, '0')}`;

    const type = await prisma.projectType.create({ data: { ...req.body, id: typeId } });
    res.status(201).json(type);
  } catch (error) {
    res.status(400).json({ message: 'Error creating type', error: error.message });
  }
};

exports.updateType = async (req, res) => {
  try {
    const type = await prisma.projectType.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(type);
  } catch (error) {
    res.status(400).json({ message: 'Error updating type', error: error.message });
  }
};

exports.deleteType = async (req, res) => {
  try {
    await prisma.projectType.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting type', error: error.message });
  }
};