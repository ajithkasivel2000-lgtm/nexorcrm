const prisma = require('../prismaClient');

exports.createLead = async (req, res) => {
  try {
    const lead = await prisma.lead.create({ data: req.body });
    res.status(201).json(lead);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create lead', error: error.message });
  }
};

exports.getLeads = async (req, res) => {
  try {
    const filters = {};
    if (req.query.project) filters.project = req.query.project;
    if (req.query.primarySource) filters.primarySource = req.query.primarySource;
    if (req.query.status) filters.status = req.query.status;
    if (req.query.owner) filters.owner = req.query.owner;
    
    const leads = await prisma.lead.findMany({ where: filters, orderBy: { createdAt: 'desc' }, include: { logs: true } });
    res.status(200).json(leads);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch leads', error: error.message });
  }
};

exports.getLeadById = async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id }, include: { logs: true } });
    if (!lead) return res.status(404).json({ message: 'Not found' });
    res.status(200).json(lead);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch lead', error: error.message });
  }
};

exports.updateLeadStatus = async (req, res) => {
  try {
    let updateData = { ...req.body };
    let logEntryData = null;
    
    // Convert date strings to Date objects for Prisma
    if (updateData.siteVisitDate) {
      updateData.siteVisitDate = new Date(updateData.siteVisitDate);
    }
    if (updateData.followUpDate) {
      updateData.followUpDate = new Date(updateData.followUpDate);
    }
    
    if (req.body.status || req.body.logEntry) {
      logEntryData = {
        title: req.body.logEntry?.title || 'Lead Enquiry Status Updated',
        subtitle: req.body.logEntry?.subtitle || `by admin as ${req.body.status}`
      };
      delete updateData.logEntry;
    }

    const updatedLead = await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        ...updateData,
        ...(logEntryData && {
          logs: {
            create: logEntryData
          }
        })
      },
      include: { logs: true }
    });
    
    res.status(200).json(updatedLead);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update lead', error: error.message });
  }
};

exports.deleteLead = async (req, res) => {
  try {
    await prisma.lead.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete', error: error.message });
  }
};