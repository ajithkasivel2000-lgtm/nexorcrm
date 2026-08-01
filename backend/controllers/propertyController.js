const prisma = require('../prismaClient');

exports.createProperty = async (req, res) => {
  try {
    const propertyId = 'PRP_' + Math.random().toString(36).substr(2, 6);
    const property = await prisma.property.create({ data: { ...req.body, propertyId } });
    res.status(201).json(property);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create property', error: error.message });
  }
};

exports.getProperties = async (req, res) => {
  try {
    const properties = await prisma.property.findMany({ orderBy: { updatedAt: 'desc' } });
    res.status(200).json(properties);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch properties', error: error.message });
  }
};

exports.getPropertyById = async (req, res) => {
  try {
    const property = await prisma.property.findUnique({ where: { id: req.params.id } });
    if (!property) return res.status(404).json({ message: 'Not found' });
    res.status(200).json(property);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch', error: error.message });
  }
};

exports.updateProperty = async (req, res) => {
  try {
    const property = await prisma.property.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(property);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update', error: error.message });
  }
};

exports.deleteProperty = async (req, res) => {
  try {
    await prisma.property.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete', error: error.message });
  }
};