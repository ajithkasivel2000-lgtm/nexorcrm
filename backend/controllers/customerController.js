const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');

exports.createCustomer = async (req, res) => {
  try {
    const customer = await prisma.customer.create({ data: { ...req.body } });
    res.status(201).json(customer);
  } catch (error) {
    sendError(res, error, 'Failed to create customer', 500);
  }
};

exports.getCustomers = async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({ orderBy: { updatedAt: 'desc' } });
    res.status(200).json(customers);
  } catch (error) {
    sendError(res, error, 'Failed to fetch customers', 500);
  }
};

exports.getCustomerById = async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
    if (!customer) return res.status(404).json({ message: 'Not found' });
    res.status(200).json(customer);
  } catch (error) {
    sendError(res, error, 'Failed to fetch', 500);
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const customer = await prisma.customer.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(customer);
  } catch (error) {
    sendError(res, error, 'Failed to update', 500);
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    await prisma.customer.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    sendError(res, error, 'Failed to delete', 500);
  }
};
