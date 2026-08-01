const prisma = require('../prismaClient');

// Helper to resolve project name/ID to project ID
const resolveProjectId = async (projectNameOrId) => {
  if (!projectNameOrId) return null;
  try {
    const project = await prisma.project.findFirst({
      where: { OR: [{ id: projectNameOrId }, { projectName: projectNameOrId }] }
    });
    return project ? project.id : projectNameOrId;
  } catch {
    return projectNameOrId;
  }
};

exports.createOpportunity = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const prefix = `OPP-${currentYear}-`;
    
    const lastOppThisYear = await prisma.opportunity.findFirst({
      where: { oppId: { startsWith: prefix } },
      orderBy: { oppId: 'desc' }
    });

    let nextNumber = 1;
    if (lastOppThisYear && lastOppThisYear.oppId) {
      const lastNumberStr = lastOppThisYear.oppId.split('-').pop();
      const lastNumber = parseInt(lastNumberStr, 10);
      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }
    
    const oppId = `${prefix}${String(nextNumber).padStart(6, '0')}`;
    let opportunityData = { ...req.body, oppId };

    if (req.body.leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: req.body.leadId } });
      if (lead) {
        opportunityData.opportunityName = lead.name;
        opportunityData.mobileNumber = lead.mobile;
        opportunityData.enquiryProject = lead.project;
        opportunityData.emailAddress = lead.email;
        opportunityData.preferredBudget = lead.budgetLimit;
      }
    }

    if (opportunityData.enquiryProject) {
      opportunityData.enquiryProject = await resolveProjectId(opportunityData.enquiryProject);
    }
    
    const opp = await prisma.opportunity.create({ data: opportunityData });
    res.status(201).json(opp);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create opportunity', error: error.message });
  }
};

exports.getOpportunities = async (req, res) => {
  try {
    const filters = {};
    if (req.query.username) {
      const user = await prisma.user.findUnique({ where: { username: req.query.username } });
      if (user) {
        if (user.status === 'Admin') {
          // Admin: sees opportunities owned by Admin + Manager + Employee
          const allUsers = await prisma.user.findMany({
            where: { status: { in: ['Admin', 'Manager', 'Employee'] } },
            select: { username: true }
          });
          const allowedOwners = allUsers.map(u => u.username);
          filters.opportunityOwner = { in: allowedOwners };
        } else if (user.status === 'Manager') {
          // Manager: sees opportunities owned by Manager + Employee (not Admin)
          const managersAndEmployees = await prisma.user.findMany({
            where: { status: { in: ['Manager', 'Employee'] } },
            select: { username: true }
          });
          const allowedOwners = managersAndEmployees.map(u => u.username);
          filters.opportunityOwner = { in: allowedOwners };
        } else if (user.status === 'Employee') {
          // Employee: sees only their own opportunities
          filters.opportunityOwner = user.username;
        }
      }
    }

    const opps = await prisma.opportunity.findMany({ 
      where: filters,
      orderBy: { updatedAt: 'desc' },
      include: { logs: { orderBy: { date: 'desc' }, take: 1 } }
    });

    // Resolve project IDs to project names
    const allProjects = await prisma.project.findMany();
    const projectMap = {};
    allProjects.forEach(p => {
      projectMap[p.id] = p.projectName;
      projectMap[p.projectName] = p.projectName;
    });

    const enrichedOpps = await Promise.all(opps.map(async (opp) => {
      let enrichedOpp = { ...opp };
      if (opp.leadId && (!opp.opportunityName || !opp.mobileNumber || !opp.enquiryProject)) {
        const lead = await prisma.lead.findUnique({ where: { id: opp.leadId } });
        if (lead) {
          enrichedOpp = {
            ...opp,
            opportunityName: opp.opportunityName || lead.name,
            mobileNumber: opp.mobileNumber || lead.mobile,
            enquiryProject: opp.enquiryProject || lead.project,
            emailAddress: opp.emailAddress || lead.email
          };
        }
      }
      // Resolve project ID/name to project name
      enrichedOpp.enquiryProject = projectMap[enrichedOpp.enquiryProject] || enrichedOpp.enquiryProject;
      return enrichedOpp;
    }));

    res.status(200).json(enrichedOpps);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch opportunities', error: error.message });
  }
};

exports.getOpportunityById = async (req, res) => {
  try {
    const opp = await prisma.opportunity.findUnique({ 
      where: { id: req.params.id },
      include: { logs: { orderBy: { date: 'desc' } } }
    });
    if (!opp) return res.status(404).json({ message: 'Not found' });

    let enrichedOpp = { ...opp };
    if (opp.leadId && (!opp.opportunityName || !opp.mobileNumber || !opp.enquiryProject)) {
      const lead = await prisma.lead.findUnique({ where: { id: opp.leadId } });
      if (lead) {
        enrichedOpp = {
          ...opp,
          opportunityName: opp.opportunityName || lead.name,
          mobileNumber: opp.mobileNumber || lead.mobile,
          enquiryProject: opp.enquiryProject || lead.project,
          emailAddress: opp.emailAddress || lead.email
        };
      }
    }

    // Resolve project ID/name to project name
    if (enrichedOpp.enquiryProject) {
      const project = await prisma.project.findFirst({
        where: { OR: [{ id: enrichedOpp.enquiryProject }, { projectName: enrichedOpp.enquiryProject }] }
      });
      if (project) {
        enrichedOpp.enquiryProject = project.projectName;
      }
    }

    res.status(200).json(enrichedOpp);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch', error: error.message });
  }
};

exports.updateOpportunity = async (req, res) => {
  try {
    const { logEntry, ...updateData } = req.body;
    const updatePayload = {
      where: { id: req.params.id },
      data: updateData
    };
    if (logEntry) {
      updatePayload.data.logs = {
        create: {
          title: logEntry.title,
          subtitle: logEntry.subtitle
        }
      };
    }
    const opp = await prisma.opportunity.update(updatePayload);
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
};
// triggering nodemon restart again