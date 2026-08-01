const prisma = require('../prismaClient');

exports.createService = async (req, res) => {
  try {
    const { sections, ...serviceData } = req.body;
    const service = await prisma.service.create({
      data: {
        ...serviceData,
        sections: sections ? { create: sections } : undefined
      },
      include: { sections: true }
    });
    res.status(201).json(service);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create service', error: error.message });
  }
};

exports.getServices = async (req, res) => {
  try {
    const services = await prisma.service.findMany({ include: { sections: true }, orderBy: { updatedAt: 'desc' } });
    res.status(200).json(services);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch services', error: error.message });
  }
};

exports.getServiceById = async (req, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id }, include: { sections: true } });
    if (!service) return res.status(404).json({ message: 'Not found' });
    res.status(200).json(service);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch', error: error.message });
  }
};

exports.updateService = async (req, res) => {
  try {
    const { sections, ...serviceData } = req.body;
    const service = await prisma.service.update({
      where: { id: req.params.id },
      data: {
        ...serviceData,
        sections: sections ? { deleteMany: {}, create: sections } : undefined
      },
      include: { sections: true }
    });
    res.status(200).json(service);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update', error: error.message });
  }
};

exports.deleteService = async (req, res) => {
  try {
    await prisma.service.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete', error: error.message });
  }
};