const fs = require('fs');
const path = require('path');

const controllersDir = path.join(__dirname, 'controllers');

const files = {
  'channelPartnerController.js': `const prisma = require('../prismaClient');

exports.createChannelPartner = async (req, res) => {
  try {
    const cpId = 'CP_' + Math.random().toString(36).substr(2, 8);
    const cp = await prisma.channelPartner.create({ data: { ...req.body, cpId } });
    res.status(201).json(cp);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create channel partner', error: error.message });
  }
};

exports.getChannelPartners = async (req, res) => {
  try {
    const cps = await prisma.channelPartner.findMany({ orderBy: { createdAt: 'desc' } });
    res.status(200).json(cps);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch channel partners', error: error.message });
  }
};

exports.getChannelPartnerById = async (req, res) => {
  try {
    const cp = await prisma.channelPartner.findUnique({ where: { id: req.params.id } });
    if (!cp) return res.status(404).json({ message: 'Not found' });
    res.status(200).json(cp);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch', error: error.message });
  }
};

exports.updateChannelPartner = async (req, res) => {
  try {
    const cp = await prisma.channelPartner.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(cp);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update', error: error.message });
  }
};

exports.deleteChannelPartner = async (req, res) => {
  try {
    await prisma.channelPartner.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete', error: error.message });
  }
};`,

  'customerController.js': `const prisma = require('../prismaClient');

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
};`,

  'enquiryController.js': `const prisma = require('../prismaClient');

exports.createEnquiry = async (req, res) => {
  try {
    const enquiry = await prisma.enquiry.create({ data: req.body });
    res.status(201).json(enquiry);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create enquiry', error: error.message });
  }
};

exports.getEnquiries = async (req, res) => {
  try {
    const enquiries = await prisma.enquiry.findMany({ orderBy: { createdAt: 'desc' } });
    res.status(200).json(enquiries);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch enquiries', error: error.message });
  }
};

exports.getEnquiryById = async (req, res) => {
  try {
    const enquiry = await prisma.enquiry.findUnique({ where: { id: req.params.id } });
    if (!enquiry) return res.status(404).json({ message: 'Not found' });
    res.status(200).json(enquiry);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch', error: error.message });
  }
};

exports.deleteEnquiry = async (req, res) => {
  try {
    await prisma.enquiry.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete', error: error.message });
  }
};`,

  'globalUserSettingController.js': `const prisma = require('../prismaClient');

exports.getSettings = async (req, res) => {
  try {
    let settings = await prisma.globalUserSetting.findFirst();
    if (!settings) {
      settings = await prisma.globalUserSetting.create({ data: {} });
    }
    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching settings', error: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    let settings = await prisma.globalUserSetting.findFirst();
    if (!settings) {
      settings = await prisma.globalUserSetting.create({ data: req.body });
    } else {
      settings = await prisma.globalUserSetting.update({ where: { id: settings.id }, data: req.body });
    }
    res.status(200).json(settings);
  } catch (error) {
    res.status(400).json({ message: 'Error updating settings', error: error.message });
  }
};`,

  'leadController.js': `const prisma = require('../prismaClient');

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
    
    if (req.body.status || req.body.logEntry) {
      logEntryData = {
        title: req.body.logEntry?.title || 'Lead Enquiry Status Updated',
        subtitle: req.body.logEntry?.subtitle || \`by admin as \${req.body.status}\`
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
};`,

  'leadStatusController.js': `const prisma = require('../prismaClient');

exports.getStatuses = async (req, res) => {
  try {
    const statuses = await prisma.leadStatus.findMany();
    // Map to include virtual statusId
    const mapped = statuses.map(s => ({ ...s, statusId: 'LEADSTS_' + s.id }));
    res.status(200).json(mapped);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching statuses', error: error.message });
  }
};

exports.createStatus = async (req, res) => {
  try {
    const status = await prisma.leadStatus.create({ data: req.body });
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
};`,

  'leadTypeController.js': `const prisma = require('../prismaClient');

exports.getTypes = async (req, res) => {
  try {
    const types = await prisma.leadType.findMany();
    const mapped = types.map(t => ({ ...t, typeId: 'LEADTP_' + t.id }));
    res.status(200).json(mapped);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching types', error: error.message });
  }
};

exports.createType = async (req, res) => {
  try {
    const type = await prisma.leadType.create({ data: req.body });
    res.status(201).json(type);
  } catch (error) {
    res.status(400).json({ message: 'Error creating type', error: error.message });
  }
};

exports.updateType = async (req, res) => {
  try {
    const type = await prisma.leadType.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(type);
  } catch (error) {
    res.status(400).json({ message: 'Error updating type', error: error.message });
  }
};

exports.deleteType = async (req, res) => {
  try {
    await prisma.leadType.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting type', error: error.message });
  }
};`,

  'opportunityController.js': `const prisma = require('../prismaClient');

exports.createOpportunity = async (req, res) => {
  try {
    const oppId = 'OPP_' + Math.random().toString(36).substr(2, 7);
    const opp = await prisma.opportunity.create({ data: { ...req.body, oppId } });
    res.status(201).json(opp);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create opportunity', error: error.message });
  }
};

exports.getOpportunities = async (req, res) => {
  try {
    const opps = await prisma.opportunity.findMany({ orderBy: { createdAt: 'desc' } });
    res.status(200).json(opps);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch opportunities', error: error.message });
  }
};

exports.getOpportunityById = async (req, res) => {
  try {
    const opp = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
    if (!opp) return res.status(404).json({ message: 'Not found' });
    res.status(200).json(opp);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch', error: error.message });
  }
};

exports.updateOpportunity = async (req, res) => {
  try {
    const opp = await prisma.opportunity.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(opp);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update', error: error.message });
  }
};

exports.deleteOpportunity = async (req, res) => {
  try {
    await prisma.opportunity.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete', error: error.message });
  }
};`,

  'primarySourceController.js': `const prisma = require('../prismaClient');

exports.getSources = async (req, res) => {
  try {
    const sources = await prisma.primarySource.findMany();
    const mapped = sources.map(s => ({ ...s, sourceId: 'PRISO_' + s.id }));
    res.status(200).json(mapped);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching', error: error.message });
  }
};

exports.createSource = async (req, res) => {
  try {
    const source = await prisma.primarySource.create({ data: req.body });
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
};`,

  'projectController.js': `const prisma = require('../prismaClient');

exports.getProjects = async (req, res) => {
  try {
    const projects = await prisma.project.findMany();
    res.status(200).json(projects);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching projects', error: error.message });
  }
};

exports.getProjectById = async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.status(200).json(project);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching project', error: error.message });
  }
};

exports.createProject = async (req, res) => {
  try {
    const project = await prisma.project.create({ data: req.body });
    res.status(201).json(project);
  } catch (error) {
    res.status(400).json({ message: 'Error creating project', error: error.message });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const project = await prisma.project.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(project);
  } catch (error) {
    res.status(400).json({ message: 'Error updating project', error: error.message });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting project', error: error.message });
  }
};`,

  'projectStatusController.js': `const prisma = require('../prismaClient');

exports.getStatuses = async (req, res) => {
  try {
    const statuses = await prisma.projectStatus.findMany();
    const mapped = statuses.map(s => ({ ...s, statusId: 'PRJSTS_' + s.id }));
    res.status(200).json(mapped);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching statuses', error: error.message });
  }
};

exports.createStatus = async (req, res) => {
  try {
    const status = await prisma.projectStatus.create({ data: req.body });
    res.status(201).json(status);
  } catch (error) {
    res.status(400).json({ message: 'Error creating status', error: error.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const status = await prisma.projectStatus.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(status);
  } catch (error) {
    res.status(400).json({ message: 'Error updating status', error: error.message });
  }
};

exports.deleteStatus = async (req, res) => {
  try {
    await prisma.projectStatus.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting status', error: error.message });
  }
};`,

  'projectTypeController.js': `const prisma = require('../prismaClient');

exports.getTypes = async (req, res) => {
  try {
    const types = await prisma.projectType.findMany();
    const mapped = types.map(t => ({ ...t, typeId: 'PRJTP_' + t.id }));
    res.status(200).json(mapped);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching types', error: error.message });
  }
};

exports.createType = async (req, res) => {
  try {
    const type = await prisma.projectType.create({ data: req.body });
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
};`,

  'propertyController.js': `const prisma = require('../prismaClient');

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
    const properties = await prisma.property.findMany({ orderBy: { createdAt: 'desc' } });
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
};`,

  'registrationSettingController.js': `const prisma = require('../prismaClient');

exports.getSettings = async (req, res) => {
  try {
    let settings = await prisma.registrationSetting.findFirst();
    if (!settings) {
      settings = await prisma.registrationSetting.create({ data: {} });
    }
    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching settings', error: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    let settings = await prisma.registrationSetting.findFirst();
    if (!settings) {
      settings = await prisma.registrationSetting.create({ data: req.body });
    } else {
      settings = await prisma.registrationSetting.update({ where: { id: settings.id }, data: req.body });
    }
    res.status(200).json(settings);
  } catch (error) {
    res.status(400).json({ message: 'Error updating settings', error: error.message });
  }
};`,

  'rrqController.js': `const prisma = require('../prismaClient');

exports.createRRQ = async (req, res) => {
  try {
    const rrqId = 'RRQ_' + Math.random().toString(36).substr(2, 6);
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
};`,

  'secondarySourceController.js': `const prisma = require('../prismaClient');

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
};`,

  'securitySettingController.js': `const prisma = require('../prismaClient');

exports.getSettings = async (req, res) => {
  try {
    let settings = await prisma.securitySetting.findFirst();
    if (!settings) {
      settings = await prisma.securitySetting.create({ data: {} });
    }
    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching settings', error: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    let settings = await prisma.securitySetting.findFirst();
    if (!settings) {
      settings = await prisma.securitySetting.create({ data: req.body });
    } else {
      settings = await prisma.securitySetting.update({ where: { id: settings.id }, data: req.body });
    }
    res.status(200).json(settings);
  } catch (error) {
    res.status(400).json({ message: 'Error updating settings', error: error.message });
  }
};`,

  'serviceController.js': `const prisma = require('../prismaClient');

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
    const services = await prisma.service.findMany({ include: { sections: true }, orderBy: { createdAt: 'desc' } });
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
};`,

  'sessionController.js': `const prisma = require('../prismaClient');

exports.getSessions = async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({ orderBy: { lastActive: 'desc' } });
    res.status(200).json(sessions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching sessions', error: error.message });
  }
};

exports.clearAllSessions = async (req, res) => {
  try {
    await prisma.session.deleteMany({});
    res.status(200).json({ message: 'All sessions cleared' });
  } catch (error) {
    res.status(500).json({ message: 'Error clearing sessions', error: error.message });
  }
};`,

  'sessionSettingController.js': `const prisma = require('../prismaClient');

exports.getSettings = async (req, res) => {
  try {
    let settings = await prisma.sessionSetting.findFirst();
    if (!settings) {
      settings = await prisma.sessionSetting.create({ data: {} });
    }
    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching settings', error: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    let settings = await prisma.sessionSetting.findFirst();
    if (!settings) {
      settings = await prisma.sessionSetting.create({ data: req.body });
    } else {
      settings = await prisma.sessionSetting.update({ where: { id: settings.id }, data: req.body });
    }
    res.status(200).json(settings);
  } catch (error) {
    res.status(400).json({ message: 'Error updating settings', error: error.message });
  }
};`,

  'tertiarySourceController.js': `const prisma = require('../prismaClient');

exports.getSources = async (req, res) => {
  try {
    const sources = await prisma.tertiarySource.findMany();
    const mapped = sources.map(s => ({ ...s, sourceId: 'TERSO_' + s.id }));
    res.status(200).json(mapped);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching', error: error.message });
  }
};

exports.createSource = async (req, res) => {
  try {
    const source = await prisma.tertiarySource.create({ data: req.body });
    res.status(201).json(source);
  } catch (error) {
    res.status(400).json({ message: 'Error creating', error: error.message });
  }
};

exports.updateSource = async (req, res) => {
  try {
    const source = await prisma.tertiarySource.update({ where: { id: req.params.id }, data: req.body });
    res.status(200).json(source);
  } catch (error) {
    res.status(400).json({ message: 'Error updating', error: error.message });
  }
};

exports.deleteSource = async (req, res) => {
  try {
    await prisma.tertiarySource.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting', error: error.message });
  }
};`,

  'userGroupController.js': `const prisma = require('../prismaClient');

exports.getUserGroups = async (req, res) => {
  try {
    const groups = await prisma.userGroup.findMany({
      include: { members: { select: { id: true, username: true } } },
      orderBy: { groupLevel: 'asc' }
    });
    res.status(200).json(groups);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching groups', error: error.message });
  }
};

exports.createUserGroup = async (req, res) => {
  try {
    const { groupName, groupLevel } = req.body;
    const group = await prisma.userGroup.create({ data: { groupName, groupLevel } });
    res.status(201).json(group);
  } catch (error) {
    res.status(400).json({ message: 'Error creating group', error: error.message });
  }
};

exports.updateUserGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { groupName, groupLevel } = req.body;
    const group = await prisma.userGroup.update({ where: { id }, data: { groupName, groupLevel } });
    res.status(200).json(group);
  } catch (error) {
    res.status(400).json({ message: 'Error updating group', error: error.message });
  }
};

exports.deleteUserGroup = async (req, res) => {
  try {
    await prisma.userGroup.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Group deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting group', error: error.message });
  }
};

exports.addMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const group = await prisma.userGroup.update({
      where: { id },
      data: { members: { connect: { id: userId } } },
      include: { members: true }
    });
    res.status(200).json(group);
  } catch (error) {
    res.status(400).json({ message: 'Error adding member', error: error.message });
  }
};

exports.removeMember = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const group = await prisma.userGroup.update({
      where: { id },
      data: { members: { disconnect: { id: userId } } },
      include: { members: true }
    });
    res.status(200).json(group);
  } catch (error) {
    res.status(400).json({ message: 'Error removing member', error: error.message });
  }
};`
};

for (const [file, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(controllersDir, file), content, 'utf-8');
}
console.log('Generated controllers');
