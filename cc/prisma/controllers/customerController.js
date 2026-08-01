const prisma = require('../prismaClient');

exports.createCustomer = async (req, res) => {
  try {
    const customerId = 'CUST_' + Math.random().toString(36).substr(2, 12);
    const customer = await prisma.customer.create({ data: { ...req.body, customerId } });
    res.status(201).json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create customer', error: error.message });
  }
};

exports.getCustomers = async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({ orderBy: { createdAt: 'desc' } });
    res.status(200).json(customers);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch customers', error: error.message });
  }
};

exports.getCustomerById = async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
    if (!customer) return res.status(404).json({ message: 'Not found' });
    res.status(200).json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch', error: error.message });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const customer = await prisma.customer.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update', error: error.message });
  }
};