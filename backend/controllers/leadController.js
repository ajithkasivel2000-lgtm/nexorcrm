const prisma = require('../prismaClient');
const nodemailer = require('nodemailer');

// Shared helper: resolve any identifier (username or UUID) to a user record
const resolveUser = async (identifier) => {
  if (!identifier) return null;
  try {
    return await prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { id: identifier }] }
    });
  } catch {
    return null;
  }
};

// Shared helper: resolve project name/ID to project ID
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

exports.createLead = async (req, res) => {
  try {
    let leadData = { ...req.body };
    
    // Generate custom Enquiry ID in ENQ-YYYY-XXXXXX format
    const currentYear = new Date().getFullYear();
    const prefix = `ENQ-${currentYear}-`;
    
    const lastLeadThisYear = await prisma.lead.findFirst({
      where: { id: { startsWith: prefix } },
      orderBy: { id: 'desc' }
    });

    let nextNumber = 1;
    if (lastLeadThisYear && lastLeadThisYear.id) {
      const lastNumberStr = lastLeadThisYear.id.split('-').pop();
      const lastNumber = parseInt(lastNumberStr, 10);
      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }
    
    leadData.id = `${prefix}${String(nextNumber).padStart(6, '0')}`;

    // Resolve project name to ID before storing
    const projectIdForCreate = await resolveProjectId(leadData.project);
    const projectNameForCreate = leadData.project; // Keep original for backward-compat lookups
    leadData.project = projectIdForCreate || leadData.project;

    // Resolve owner username/ID to UUID for storage
    let ownerUser = await resolveUser(leadData.owner);
    const creator = ownerUser ? ownerUser.username : (leadData.owner || 'admin');
    
    // Check if the logged-in user is an Employee so we can skip RRQ
    let isEmployeeUser = false;
    if (ownerUser && ownerUser.status === 'Employee') {
      isEmployeeUser = true;
    }
    
    // Duplicate Check: match both new format (project ID) and old format (project name)
    const duplicateLead = await prisma.lead.findFirst({
      where: {
        mobile: leadData.mobile,
        email: leadData.email,
        OR: [
          { project: leadData.project },          // New format: project ID
          { project: projectNameForCreate }        // Old format: project name
        ]
      }
    });

    if (duplicateLead) {
      leadData.status = 'Duplicate';
      // Assign duplicate leads to super admin
      const adminUser = await prisma.user.findFirst({ where: { username: 'admin' } });
      leadData.owner = adminUser ? adminUser.id : 'admin';
      leadData.ownerId = adminUser ? adminUser.id : null;
    }
    
    // RRQ Logic: assign lead to the next project owner in round-robin sequence
    if (projectNameForCreate && !duplicateLead && !isEmployeeUser) {
      const rrq = await prisma.rRQ.findFirst({
        where: { 
          projectName: projectNameForCreate,
          rrqType: 'Presales'
        }
      });
      
      if (rrq && rrq.assignedUsers && rrq.assignedUsers.length > 0) {
        // Find the last lead for this project (match both new ID + old name formats)
        const lastLead = await prisma.lead.findFirst({
          where: {
            OR: [
              { project: leadData.project },         // New format: project ID
              { project: projectNameForCreate }       // Old format: project name
            ]
          },
          orderBy: { createdAt: 'desc' }
        });
        
        let nextUser = rrq.assignedUsers[0];
        
        if (lastLead && lastLead.owner) {
          // Determine the last owner - stored as UUID now
          let lastOwnerId = lastLead.owner;
          // Check if owner is a UUID by looking up in assignedUsers as IDs
          if (!rrq.assignedUsers.includes(lastLead.owner)) {
            // Could be a username from old leads - resolve to ID for comparison
            const lastOwnerUser = await resolveUser(lastLead.owner);
            if (lastOwnerUser) {
              lastOwnerId = lastOwnerUser.id;
            } else if (lastLead.ownerId) {
              lastOwnerId = lastLead.ownerId;
            }
          }
          
          // Find last owner's index in assignedUsers (comparing by resolved user IDs)
          let lastIndex = -1;
          for (let i = 0; i < rrq.assignedUsers.length; i++) {
            const au = await resolveUser(rrq.assignedUsers[i]);
            if (au && au.id === lastOwnerId) {
              lastIndex = i;
              break;
            }
          }
          
          if (lastIndex !== -1) {
            const nextIndex = (lastIndex + 1) % rrq.assignedUsers.length;
            nextUser = rrq.assignedUsers[nextIndex];
          }
        }
        
        // Resolve assigned user to UUID
        const assignedUser = await resolveUser(nextUser);
        if (assignedUser) {
          leadData.owner = assignedUser.id;       // Store UUID
          leadData.ownerId = assignedUser.id;      // Store UUID
        }
      }
    }

    // Ensure ownerId is always resolved from the owner
    if (!leadData.ownerId && leadData.owner) {
      const userForOwner = await resolveUser(leadData.owner);
      if (userForOwner) {
        leadData.owner = userForOwner.id;
        leadData.ownerId = userForOwner.id;
      }
    }

    // Add initial log entry
    leadData.logs = {
      create: {
        title: duplicateLead ? 'Duplicate Lead Created' : 'New Lead Created',
        subtitle: `by ${creator}`
      }
    };
    
    const lead = await prisma.lead.create({ 
      data: leadData,
      include: { logs: true }
    });
    
    // Resolve IDs to display names for the response
    let displayOwnerName = lead.owner;
    if (lead.ownerId || lead.owner) {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { id: lead.ownerId || lead.owner },
            { username: lead.owner }
          ]
        }
      });
      if (user) displayOwnerName = user.username || user.firstName || lead.owner;
    }

    let displayProjectName = lead.project;
    if (lead.project) {
      const project = await prisma.project.findFirst({
        where: { OR: [{ id: lead.project }, { projectName: lead.project }] }
      });
      if (project) displayProjectName = project.projectName;
    }

    const leadWithResolvedNames = {
      ...lead,
      ownerName: displayOwnerName,
      owner: displayOwnerName,
      projectName: displayProjectName,
      project: displayProjectName
    };

    res.status(201).json(leadWithResolvedNames);
    
    // Send email notification to lead owner (non-blocking - sent after response)
    setImmediate(async () => {
      try {
        const mailSettings = await prisma.mailSetting.findFirst();
        if (mailSettings && mailSettings.smtpHost && mailSettings.enabled) {
          const emailTemplate = await prisma.emailTemplate.findFirst({
            where: { templateKey: 'CREATE_NEW_LEAD_TEMPLATE' }
          });
          
          if (emailTemplate) {
            // Find the owner's email address
            const ownerUser = await prisma.user.findFirst({
              where: {
                OR: [
                  { id: lead.ownerId || lead.owner },
                  { username: lead.owner }
                ]
              }
            });
            
            if (ownerUser && ownerUser.email) {
              // Replace template placeholders with actual lead data
              const replacements = {
                '{OWNER_NAME}': displayOwnerName || lead.owner || '',
                '{ENQUIRY_ID}': lead.id || '',
                '{CUSTOMER_NAME}': lead.name || '',
                '{COMPANY_NAME}': '',
                '{PHONE}': lead.mobile || '',
                '{EMAIL}': lead.email || '',
                '{PROJECT_NAME}': displayProjectName || lead.project || '',
                '{SOURCE}': lead.primarySource || '',
                '{LEAD_OWNER}': displayOwnerName || '',
                '{CREATED_BY}': creator || 'admin',
                '{DATE}': lead.createdAt ? new Date(lead.createdAt).toLocaleString() : ''
              };
              
              let subject = emailTemplate.subject || 'New Lead Created';
              let htmlBody = emailTemplate.bodyContent || '';
              
              for (const [key, value] of Object.entries(replacements)) {
                subject = subject.split(key).join(value);
                htmlBody = htmlBody.split(key).join(value);
              }
              
              // If no body content in template, use a default HTML
              if (!htmlBody.trim()) {
                htmlBody = `
                  <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>New Lead Created</h2>
                    <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Name</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${lead.name}</td></tr>
                      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Mobile</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${lead.mobile}</td></tr>
                      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Email</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${lead.email || 'N/A'}</td></tr>
                      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Project</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${displayProjectName || lead.project || 'N/A'}</td></tr>
                      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Source</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${lead.primarySource || 'N/A'}</td></tr>
                      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Status</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${lead.status}</td></tr>
                      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Assigned To</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${displayOwnerName}</td></tr>
                    </table>
                    <hr />
                    <p style="color: #666; font-size: 12px;">Sent via nexusCRM Lead Management System</p>
                  </div>
                `;
              }
              
              // Wrap body in div to preserve line breaks from plain text templates
              htmlBody = `<div style="white-space: pre-line; font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">${htmlBody}</div>`;
              
              const transporter = nodemailer.createTransport({
                host: mailSettings.smtpHost,
                port: mailSettings.smtpPort,
                secure: mailSettings.smtpPort === 465,
                auth: mailSettings.smtpAuth === 'True' ? {
                  user: mailSettings.smtpUsername,
                  pass: mailSettings.smtpPassword
                } : undefined,
                tls: mailSettings.starttls === 'True' ? { rejectUnauthorized: false } : undefined
              });
              
              await transporter.sendMail({
                from: `"${mailSettings.fromName || 'nexusCRM'}" <${mailSettings.fromEmail}>`,
                to: ownerUser.email,
                subject: subject,
                html: htmlBody
              });
              
              console.log(`Lead notification email sent to ${ownerUser.email} for lead ${lead.id}`);
            }
          }
        }
      } catch (emailError) {
        console.error('Failed to send lead notification email:', emailError.message);
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create lead', error: error.message });
  }
};



exports.getLeads = async (req, res) => {
  try {
    const filters = {};
    
    // Resolve project filter: frontend sends project name, DB stores project ID
    if (req.query.project) {
      const projectRec = await prisma.project.findFirst({
        where: { OR: [{ id: req.query.project }, { projectName: req.query.project }] }
      });
      filters.project = projectRec ? projectRec.id : req.query.project;
    }
    if (req.query.primarySource) filters.primarySource = req.query.primarySource;
    if (req.query.status) filters.status = req.query.status;
    
    // Handle owner filter: resolve username/ID to ownerId
    if (req.query.owner) {
      const ownerUser = await prisma.user.findFirst({
        where: { OR: [{ username: req.query.owner }, { id: req.query.owner }] }
      });
      if (ownerUser) {
        filters.ownerId = ownerUser.id;
      } else {
        filters.owner = req.query.owner; // Fallback for old data
      }
    }
    
    if (req.query.username) {
      const loggedInUser = await prisma.user.findUnique({ where: { username: req.query.username } });
      if (loggedInUser) {
        if (loggedInUser.status === 'Admin') {
          // Admin: sees leads owned by Admin + Manager + Employee
          const allowedUsers = await prisma.user.findMany({
            where: { status: { in: ['Admin', 'Manager', 'Employee'] } },
            select: { id: true, username: true }
          });
          const allowedUserIds = allowedUsers.map(u => u.id);
          const allowedUsernames = allowedUsers.map(u => u.username);

          if (filters.ownerId) {
            if (!allowedUserIds.includes(filters.ownerId)) {
              return res.status(200).json([]);
            }
          } else if (filters.owner) {
            if (!allowedUsernames.includes(filters.owner)) {
              return res.status(200).json([]);
            }
          } else {
            // Use OR to match both new leads (ownerId = UUID) and old leads (owner = username)
            filters.AND = [
              {
                OR: [
                  { ownerId: { in: allowedUserIds } },
                  { owner: { in: allowedUsernames } }
                ]
              }
            ];
            // Remove the old top-level filter keys to avoid conflict
            delete filters.owner;
            delete filters.ownerId;
          }
        } else if (loggedInUser.status === 'Manager') {
          // Manager: sees leads owned by Manager + Employee (not Admin)
          const allowedUsers = await prisma.user.findMany({
            where: { status: { in: ['Manager', 'Employee'] } },
            select: { id: true, username: true }
          });
          const allowedUserIds = allowedUsers.map(u => u.id);
          const allowedUsernames = allowedUsers.map(u => u.username);

          if (filters.ownerId) {
            if (!allowedUserIds.includes(filters.ownerId)) {
              return res.status(200).json([]);
            }
          } else if (filters.owner) {
            if (!allowedUsernames.includes(filters.owner)) {
              return res.status(200).json([]);
            }
          } else {
            filters.AND = [
              {
                OR: [
                  { ownerId: { in: allowedUserIds } },
                  { owner: { in: allowedUsernames } }
                ]
              }
            ];
            delete filters.owner;
            delete filters.ownerId;
          }
        } else if (loggedInUser.status === 'Employee') {
          // Employee: sees only their own leads — match both ownerId (UUID) and owner (username)
          filters.AND = [
            {
              OR: [
                { ownerId: loggedInUser.id },
                { owner: loggedInUser.username }
              ]
            }
          ];
          delete filters.owner;
          delete filters.ownerId;
        }
      }
    }
    
    const leads = await prisma.lead.findMany({ where: filters, orderBy: { updatedAt: 'desc' }, include: { logs: true } });
    
    // Resolve owner IDs to display names
    const allUsers = await prisma.user.findMany();
    const userMap = {};
    allUsers.forEach(u => {
      userMap[u.id] = u.username || u.firstName || u.id;
      userMap[u.username] = u.username || u.firstName || u.username;
    });

    // Resolve project IDs to project names
    const allProjects = await prisma.project.findMany();
    const projectMap = {};
    allProjects.forEach(p => {
      projectMap[p.id] = p.projectName;
      projectMap[p.projectName] = p.projectName;
    });

    const leadsWithResolvedNames = leads.map(lead => {
      const displayOwnerName = userMap[lead.ownerId] || userMap[lead.owner] || lead.owner;
      const displayProjectName = projectMap[lead.project] || lead.project;
      return {
        ...lead,
        ownerName: displayOwnerName,
        owner: displayOwnerName,
        projectName: displayProjectName,
        project: displayProjectName  // Override for frontend display compatibility
      };
    });
    
    res.status(200).json(leadsWithResolvedNames);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch leads', error: error.message });
  }
};

exports.getLeadById = async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id }, include: { logs: true } });
    if (!lead) return res.status(404).json({ message: 'Not found' });
    
    // Resolve owner ID to display name
    let displayOwnerName = lead.owner;
    if (lead.ownerId || lead.owner) {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { id: lead.ownerId || lead.owner },
            { username: lead.owner }
          ]
        }
      });
      if (user) displayOwnerName = user.username || user.firstName || lead.owner;
    }

    // Resolve project ID to project name
    let displayProjectName = lead.project;
    if (lead.project) {
      const project = await prisma.project.findFirst({
        where: { OR: [{ id: lead.project }, { projectName: lead.project }] }
      });
      if (project) displayProjectName = project.projectName;
    }

    const leadWithResolvedNames = {
      ...lead,
      ownerName: displayOwnerName,
      owner: displayOwnerName,
      projectName: displayProjectName,
      project: displayProjectName  // Override for frontend display compatibility
    };
    res.status(200).json(leadWithResolvedNames);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch lead', error: error.message });
  }
};

exports.importLeads = async (req, res) => {
  try {
    const { queueType, projectId, leads } = req.body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ message: 'No leads data found to import.' });
    }

    // Look up project if selected from form
    let targetProject = null;
    if (projectId) {
      targetProject = await prisma.project.findFirst({
        where: {
          OR: [
            { id: projectId },
            { projectName: projectId }
          ]
        }
      });
    }

    const importedLeads = [];
    const currentYear = new Date().getFullYear();
    const prefix = `ENQ-${currentYear}-`;

    for (const item of leads) {
      // Support new CSV format: lowercase headers + project ID
      // New format: enquiry name, phone number, email id, primary source, secondary source, tertiary source, project id
      // Old format: Enquiry Name, Phone Number, Primary Source, Secondary Source, Project Interested
      const name = item.name || item['enquiry name'] || item['Enquiry Name'] || item['Name'] || item['Lead Name'];
      const mobile = item.mobile || item['phone number'] || item['Phone Number'] || item['Mobile'] || item['Phone'];
      const email = item.email || item['email id'] || item['Email'] || item['Email Id'] || null;
      const primarySource = item.primarySource || item['primary source'] || item['Primary Source'] || 'Website';
      const secondarySource = item.secondarySource || item['secondary source'] || item['Secondary Source'] || '';
      const tertiarySource = item.tertiarySource || item['tertiary source'] || item['Tertiary Source'] || '';
      const csvProject = item.project || item['project id'] || item['Project Interested'] || item['Project'] || item['project'];

      if (!name || !mobile) continue;

      // Resolve Project
      const projName = csvProject || targetProject?.projectName || 'General';
      const currentProj = (targetProject && targetProject.projectName === projName) 
        ? targetProject 
        : await prisma.project.findFirst({
            where: {
              OR: [
                { id: projName },
                { projectName: projName }
              ]
            }
          });

      // Resolve Project Owner — same RRQ round-robin logic as createLead
      let ownerUserId = null;
      let ownerUsername = null;

      if (currentProj) {
        // Check RRQ for project (filter by queueType: 'Presales' for pre-sales, etc.)
        const rrqTypeForImport = queueType === 'sales' ? 'Sales' : 'Presales';
        const rrq = await prisma.rRQ.findFirst({
          where: { 
            projectName: currentProj.projectName,
            rrqType: rrqTypeForImport
          }
        });

        if (rrq && rrq.assignedUsers && rrq.assignedUsers.length > 0) {
          // Find the last lead for this project (match both ID + name formats)
          const lastLead = await prisma.lead.findFirst({
            where: {
              OR: [
                { project: currentProj.id },
                { project: currentProj.projectName }
              ]
            },
            orderBy: { createdAt: 'desc' }
          });

          let nextUser = rrq.assignedUsers[0];

          if (lastLead && lastLead.owner) {
            let lastOwnerId = lastLead.owner;
            if (!rrq.assignedUsers.includes(lastLead.owner)) {
              const lastOwnerUser = await resolveUser(lastLead.owner);
              if (lastOwnerUser) {
                lastOwnerId = lastOwnerUser.id;
              } else if (lastLead.ownerId) {
                lastOwnerId = lastLead.ownerId;
              }
            }

            // Find last owner's index in assignedUsers
            let lastIndex = -1;
            for (let i = 0; i < rrq.assignedUsers.length; i++) {
              const au = await resolveUser(rrq.assignedUsers[i]);
              if (au && au.id === lastOwnerId) {
                lastIndex = i;
                break;
              }
            }

            if (lastIndex !== -1) {
              const nextIndex = (lastIndex + 1) % rrq.assignedUsers.length;
              nextUser = rrq.assignedUsers[nextIndex];
            }
          }

          const assignedUser = await resolveUser(nextUser);
          if (assignedUser) {
            ownerUserId = assignedUser.id;
            ownerUsername = assignedUser.username;
          }
        }

        if (!ownerUserId && currentProj.developerId) {
          const devUser = await prisma.user.findUnique({ where: { id: currentProj.developerId } });
          if (devUser) {
            ownerUserId = devUser.id;
            ownerUsername = devUser.username;
          }
        }
      }

      // Default to admin user ID if no owner found
      if (!ownerUserId) {
        const adminUser = await prisma.user.findFirst({ where: { username: 'admin' } });
        if (adminUser) {
          ownerUserId = adminUser.id;
          ownerUsername = adminUser.username;
        } else {
          ownerUserId = 'admin';
          ownerUsername = 'admin';
        }
      }

      // Generate next Enquiry ID
      const lastLead = await prisma.lead.findFirst({
        where: { id: { startsWith: prefix } },
        orderBy: { id: 'desc' }
      });

      let nextNum = 1;
      if (lastLead && lastLead.id) {
        const parts = lastLead.id.split('-');
        const num = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(num)) nextNum = num + 1;
      }

      const newId = `${prefix}${String(nextNum).padStart(6, '0')}`;
      const cleanMobile = String(mobile).replace(/\D/g, '');

      // Duplicate Check (match both new project ID format and old project name format)
      const duplicate = await prisma.lead.findFirst({
        where: { 
          mobile: cleanMobile, 
          OR: [
            { project: currentProj ? currentProj.id : projName },           // New: project ID
            { project: currentProj ? currentProj.projectName : projName }    // Old: project name
          ]
        }
      });

      // For duplicate leads: reassign owner to admin (same as createLead behavior)
      if (duplicate) {
        const adminUser = await prisma.user.findFirst({ where: { username: 'admin' } });
        ownerUserId = adminUser ? adminUser.id : 'admin';
        ownerUsername = adminUser ? adminUser.username : 'admin';
      }

      // Save into Database
      // - owner stores the User UUID (ID, not name)
      // - ownerId stores the UUID
      // - project stores the Project ID (ID, not name)
      const newLead = await prisma.lead.create({
        data: {
          id: newId,
          name,
          email,
          mobile: cleanMobile,
          primarySource,
          secondarySource,
          tertiarySource,
          project: currentProj ? currentProj.id : projName,     // Stores Project ID
          status: duplicate ? 'Duplicate' : (queueType === 'sales' ? 'Interested' : 'New Lead'),
          owner: ownerUserId,                                      // Stores User UUID
          ownerId: ownerUserId,                                    // Stores User UUID
          logs: {
            create: {
              title: duplicate ? 'Duplicate Lead Imported' : 'Lead Imported via CSV',
              subtitle: `Assigned to ${ownerUsername || ownerUserId}`
            }
          }
        }
      });

      importedLeads.push(newLead);
    }

    res.status(200).json({
      message: `Successfully imported ${importedLeads.length} lead(s)`,
      count: importedLeads.length,
      importedLeads
    });
  } catch (error) {
    console.error('Failed to import leads:', error);
    res.status(500).json({ message: 'Failed to import leads', error: error.message });
  }
};

exports.updateLeadStatus = async (req, res) => {
  try {
    // Fetch lead before update to get owner/project info for potential email
    const currentLead = await prisma.lead.findUnique({
      where: { id: req.params.id }
    });
    
    if (!currentLead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const isSiteVisitUpdate = !!(req.body.siteVisitDate || (req.body.siteVisitStatus && req.body.siteVisitStatus !== 'Opportunity') || req.body.status === 'Site Visit');
    
    let updateData = { ...req.body };
    let logEntryData = null;
    
    // Convert date strings to Date objects for Prisma
    if (updateData.siteVisitDate) {
      updateData.siteVisitDate = new Date(updateData.siteVisitDate);
    }
    if (updateData.followUpDate) {
      updateData.followUpDate = new Date(updateData.followUpDate);
    }
    if (updateData.siteVisitConfirmedDate) {
      updateData.siteVisitConfirmedDate = new Date(updateData.siteVisitConfirmedDate);
    }
    if (updateData.siteVisitDoneDate) {
      updateData.siteVisitDoneDate = new Date(updateData.siteVisitDoneDate);
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
    
    // Resolve IDs to display names for the response
    let displayOwnerName = updatedLead.owner;
    if (updatedLead.ownerId || updatedLead.owner) {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { id: updatedLead.ownerId || updatedLead.owner },
            { username: updatedLead.owner }
          ]
        }
      });
      if (user) displayOwnerName = user.username || user.firstName || updatedLead.owner;
    }

    let displayProjectName = updatedLead.project;
    if (updatedLead.project) {
      const project = await prisma.project.findFirst({
        where: { OR: [{ id: updatedLead.project }, { projectName: updatedLead.project }] }
      });
      if (project) displayProjectName = project.projectName;
    }

    const leadWithResolvedNames = {
      ...updatedLead,
      ownerName: displayOwnerName,
      owner: displayOwnerName,
      projectName: displayProjectName,
      project: displayProjectName
    };

    res.status(200).json(leadWithResolvedNames);
    
    // Send opportunity conversion notification email (non-blocking - sent after response)
    const isOpportunityUpdate = !!(req.body.status === 'Opportunity' || req.body.siteVisitStatus === 'Opportunity');
    
    if (isOpportunityUpdate) {
      setImmediate(async () => {
        try {
          const mailSettings = await prisma.mailSetting.findFirst();
          if (mailSettings && mailSettings.smtpHost && mailSettings.enabled) {
            const emailTemplate = await prisma.emailTemplate.findFirst({
              where: { templateKey: 'LEAD_CONVERTED_TO_OPPORTUNITY_TEMPLATE' }
            });
            
            if (emailTemplate) {
              // Find the opportunity created for this lead
              const opportunity = await prisma.opportunity.findFirst({
                where: { leadId: req.params.id },
                orderBy: { createdAt: 'desc' }
              });
              
              // Resolve owner info
              let displayOwnerName = currentLead.owner;
              if (currentLead.ownerId || currentLead.owner) {
                const user = await prisma.user.findFirst({
                  where: {
                    OR: [
                      { id: currentLead.ownerId || currentLead.owner },
                      { username: currentLead.owner }
                    ]
                  }
                });
                if (user) displayOwnerName = user.username || user.firstName || currentLead.owner;
              }
              
              // Resolve project name
              let displayProjectName = currentLead.project;
              if (currentLead.project) {
                const project = await prisma.project.findFirst({
                  where: { OR: [{ id: currentLead.project }, { projectName: currentLead.project }] }
                });
                if (project) displayProjectName = project.projectName;
              }
              
              // Find the owner's email address
              const ownerUser = await prisma.user.findFirst({
                where: {
                  OR: [
                    { id: currentLead.ownerId || currentLead.owner },
                    { username: currentLead.owner }
                  ]
                }
              });
              
              if (ownerUser && ownerUser.email) {
                const replacements = {
                  '{OWNER_NAME}': displayOwnerName || currentLead.owner || '',
                  '{OPPORTUNITY_ID}': opportunity?.oppId || '',
                  '{ENQUIRY_ID}': currentLead.id || '',
                  '{CUSTOMER_NAME}': currentLead.name || '',
                  '{COMPANY_NAME}': '',
                  '{PROJECT_NAME}': displayProjectName || currentLead.project || ''
                };
                
                let subject = emailTemplate.subject || 'Lead Converted to Opportunity';
                let htmlBody = emailTemplate.bodyContent || '';
                
                for (const [key, value] of Object.entries(replacements)) {
                  subject = subject.split(key).join(value);
                  htmlBody = htmlBody.split(key).join(value);
                }
                
                if (!htmlBody.trim()) {
                  htmlBody = `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                      <h2>Lead Converted to Opportunity</h2>
                      <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Opportunity ID</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${opportunity?.oppId || 'N/A'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Enquiry ID</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${currentLead.id}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Customer</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${currentLead.name}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Project</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${displayProjectName || currentLead.project || 'N/A'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Assigned To</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${displayOwnerName}</td></tr>
                      </table>
                      <hr />
                      <p style="color: #666; font-size: 12px;">Sent via nexusCRM Lead Management System</p>
                    </div>
                  `;
                }
                
              // Wrap body in div to preserve line breaks from plain text templates
              htmlBody = `<div style="white-space: pre-line; font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">${htmlBody}</div>`;
                
                const transporter = nodemailer.createTransport({
                  host: mailSettings.smtpHost,
                  port: mailSettings.smtpPort,
                  secure: mailSettings.smtpPort === 465,
                  auth: mailSettings.smtpAuth === 'True' ? {
                    user: mailSettings.smtpUsername,
                    pass: mailSettings.smtpPassword
                  } : undefined,
                  tls: mailSettings.starttls === 'True' ? { rejectUnauthorized: false } : undefined
                });
                
                await transporter.sendMail({
                  from: `"${mailSettings.fromName || 'nexusCRM'}" <${mailSettings.fromEmail}>`,
                  to: ownerUser.email,
                  subject: subject,
                  html: htmlBody
                });
                
                console.log(`Opportunity notification email sent to ${ownerUser.email} for lead ${currentLead.id}`);
              }
            }
          }
        } catch (emailError) {
          console.error('Failed to send opportunity notification email:', emailError.message);
        }
      });
    }

    // Send site visit notification email (non-blocking - sent after response)
    if (isSiteVisitUpdate) {
      setImmediate(async () => {
        try {
          const mailSettings = await prisma.mailSetting.findFirst();
          if (mailSettings && mailSettings.smtpHost && mailSettings.enabled) {
            const emailTemplate = await prisma.emailTemplate.findFirst({
              where: { templateKey: 'SITE_VISIT_SCHEDULED_TEMPLATE' }
            });
            
            if (emailTemplate) {
              // Resolve owner info
              let displayOwnerName = currentLead.owner;
              if (currentLead.ownerId || currentLead.owner) {
                const user = await prisma.user.findFirst({
                  where: {
                    OR: [
                      { id: currentLead.ownerId || currentLead.owner },
                      { username: currentLead.owner }
                    ]
                  }
                });
                if (user) displayOwnerName = user.username || user.firstName || currentLead.owner;
              }
              
              // Resolve project name
              let displayProjectName = currentLead.project;
              if (currentLead.project) {
                const project = await prisma.project.findFirst({
                  where: { OR: [{ id: currentLead.project }, { projectName: currentLead.project }] }
                });
                if (project) displayProjectName = project.projectName;
              }
              
              // Find the owner's email address
              const ownerUser = await prisma.user.findFirst({
                where: {
                  OR: [
                    { id: currentLead.ownerId || currentLead.owner },
                    { username: currentLead.owner }
                  ]
                }
              });
              
              if (ownerUser && ownerUser.email) {
                // Format site visit date/time
                const visitDate = updatedLead.siteVisitDate || currentLead.siteVisitDate;
                let visitDateStr = '';
                let visitTimeStr = '';
                if (visitDate) {
                  const d = new Date(visitDate);
                  visitDateStr = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                  visitTimeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                }
                
                const replacements = {
                  '{OWNER_NAME}': displayOwnerName || currentLead.owner || '',
                  '{ENQUIRY_ID}': currentLead.id || '',
                  '{CUSTOMER_NAME}': currentLead.name || '',
                  '{PROJECT_NAME}': displayProjectName || currentLead.project || '',
                  '{VISIT_DATE}': visitDateStr,
                  '{VISIT_TIME}': visitTimeStr,
                  '{LOCATION}': displayProjectName || currentLead.project || ''
                };
                
                let subject = emailTemplate.subject || 'Site Visit Scheduled';
                let htmlBody = emailTemplate.bodyContent || '';
                
                for (const [key, value] of Object.entries(replacements)) {
                  subject = subject.split(key).join(value);
                  htmlBody = htmlBody.split(key).join(value);
                }
                
                if (!htmlBody.trim()) {
                  htmlBody = `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                      <h2>Site Visit Scheduled</h2>
                      <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Customer</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${currentLead.name}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Project</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${displayProjectName || currentLead.project || 'N/A'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Visit Date</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${visitDateStr || 'N/A'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Phone</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${currentLead.mobile}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Assigned To</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${displayOwnerName}</td></tr>
                      </table>
                      <hr />
                      <p style="color: #666; font-size: 12px;">Sent via nexusCRM Lead Management System</p>
                    </div>
                  `;
                }
                
              // Wrap body in div to preserve line breaks from plain text templates
              htmlBody = `<div style="white-space: pre-line; font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">${htmlBody}</div>`;
                
                const transporter = nodemailer.createTransport({
                  host: mailSettings.smtpHost,
                  port: mailSettings.smtpPort,
                  secure: mailSettings.smtpPort === 465,
                  auth: mailSettings.smtpAuth === 'True' ? {
                    user: mailSettings.smtpUsername,
                    pass: mailSettings.smtpPassword
                  } : undefined,
                  tls: mailSettings.starttls === 'True' ? { rejectUnauthorized: false } : undefined
                });
                
                await transporter.sendMail({
                  from: `"${mailSettings.fromName || 'nexusCRM'}" <${mailSettings.fromEmail}>`,
                  to: ownerUser.email,
                  subject: subject,
                  html: htmlBody
                });
                
                console.log(`Site visit email sent to ${ownerUser.email} for lead ${currentLead.id}`);
              }
            }
          }
        } catch (emailError) {
          console.error('Failed to send site visit notification email:', emailError.message);
        }
      });
    }
  } catch (error) {
    res.status(500).json({ message: 'Failed to update lead', error: error.message });
  }
};

exports.getSvStatuses = async (req, res) => {
  try {
    const leads = await prisma.lead.findMany({
      where: { siteVisitStatus: { not: null } },
      select: { siteVisitStatus: true },
      distinct: ['siteVisitStatus']
    });
    const statuses = leads
      .map(l => l.siteVisitStatus)
      .filter(Boolean)
      .sort();
    res.status(200).json(statuses);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch SV statuses', error: error.message });
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

// Public API for website forms - no auth required
exports.websiteLead = async (req, res) => {
  try {
    const { name, mobile, email, project, message, source } = req.body;

    // Validate required fields
    if (!name || !mobile) {
      return res.status(400).json({ message: 'Name and mobile are required.' });
    }

    // Generate Enquiry ID
    const currentYear = new Date().getFullYear();
    const prefix = `ENQ-${currentYear}-`;
    const lastLeadThisYear = await prisma.lead.findFirst({
      where: { id: { startsWith: prefix } },
      orderBy: { id: 'desc' }
    });
    let nextNumber = 1;
    if (lastLeadThisYear && lastLeadThisYear.id) {
      const lastNumberStr = lastLeadThisYear.id.split('-').pop();
      const lastNumber = parseInt(lastNumberStr, 10);
      if (!isNaN(lastNumber)) nextNumber = lastNumber + 1;
    }
    const leadId = `${prefix}${String(nextNumber).padStart(6, '0')}`;

    // Resolve project name to ID
    let projectId = null;
    let projectName = project || 'General';
    if (project) {
      const projectRec = await prisma.project.findFirst({
        where: { OR: [{ id: project }, { projectName: project }] }
      });
      if (projectRec) {
        projectId = projectRec.id;
        projectName = projectRec.projectName;
      } else {
        projectId = project;
      }
    }

    // Resolve owner via RRQ for the project
    let ownerId = null;
    const adminUser = await prisma.user.findFirst({ where: { username: 'admin' } });
    const defaultOwnerId = adminUser ? adminUser.id : 'admin';

    const rrq = await prisma.rRQ.findFirst({
      where: { projectName, rrqType: 'Presales' }
    });

    if (rrq && rrq.assignedUsers && rrq.assignedUsers.length > 0) {
      const lastLead = await prisma.lead.findFirst({
        where: { OR: [{ project: projectId }, { project: projectName }] },
        orderBy: { createdAt: 'desc' }
      });

      let nextUser = rrq.assignedUsers[0];
      if (lastLead && lastLead.owner) {
        let lastOwnerId = lastLead.owner;
        if (!rrq.assignedUsers.includes(lastLead.owner)) {
          const lastOwnerUser = await resolveUser(lastLead.owner);
          if (lastOwnerUser) lastOwnerId = lastOwnerUser.id;
          else if (lastLead.ownerId) lastOwnerId = lastLead.ownerId;
        }
        let lastIndex = -1;
        for (let i = 0; i < rrq.assignedUsers.length; i++) {
          const au = await resolveUser(rrq.assignedUsers[i]);
          if (au && au.id === lastOwnerId) { lastIndex = i; break; }
        }
        if (lastIndex !== -1) {
          nextUser = rrq.assignedUsers[(lastIndex + 1) % rrq.assignedUsers.length];
        }
      }
      const assignedUser = await resolveUser(nextUser);
      if (assignedUser) ownerId = assignedUser.id;
    }

    if (!ownerId) {
      // Fallback: try project's developer, then admin
      if (projectId) {
        const projRec = await prisma.project.findUnique({ where: { id: projectId } });
        if (projRec && projRec.developerId) {
          const devUser = await prisma.user.findUnique({ where: { id: projRec.developerId } });
          if (devUser) ownerId = devUser.id;
        }
      }
      if (!ownerId) ownerId = defaultOwnerId;
    }

    // Clean mobile number
    const cleanMobile = String(mobile).replace(/\D/g, '');

    // Create the lead
    const lead = await prisma.lead.create({
      data: {
        id: leadId,
        name,
        mobile: cleanMobile,
        email: email || null,
        primarySource: source || 'Website',
        status: 'New Lead',
        project: projectId || projectName,
        owner: ownerId,
        ownerId: ownerId,
        remarks: message || null,
        logs: {
          create: {
            title: 'Website Lead Created',
            subtitle: 'via website form'
          }
        }
      },
      include: { logs: true }
    });

    // Send success response
    res.status(201).json({
      success: true,
      message: 'Your enquiry has been submitted successfully. We will get back to you shortly.',
      leadId: lead.id
    });

    // Send email notification to owner (non-blocking)
    if (ownerId) {
      // Resolve actual owner display name from the assigned ownerId
      let displayOwnerName = 'Admin';
      const ownerUserForName = await prisma.user.findUnique({ where: { id: ownerId } });
      if (ownerUserForName) displayOwnerName = ownerUserForName.username || ownerUserForName.firstName || 'Admin';
      const displayProjectName = projectName;

      setImmediate(async () => {
        try {
          const mailSettings = await prisma.mailSetting.findFirst();
          if (mailSettings && mailSettings.smtpHost && mailSettings.enabled) {
            const emailTemplate = await prisma.emailTemplate.findFirst({
              where: { templateKey: 'CREATE_NEW_LEAD_TEMPLATE' }
            });
            if (emailTemplate) {
              const ownerUser = await prisma.user.findUnique({ where: { id: ownerId } });
              if (ownerUser && ownerUser.email) {
                const replacements = {
                  '{OWNER_NAME}': displayOwnerName || '',
                  '{ENQUIRY_ID}': lead.id || '',
                  '{CUSTOMER_NAME}': lead.name || '',
                  '{COMPANY_NAME}': '',
                  '{PHONE}': lead.mobile || '',
                  '{EMAIL}': lead.email || '',
                  '{PROJECT_NAME}': displayProjectName || '',
                  '{SOURCE}': source || 'Website',
                  '{LEAD_OWNER}': displayOwnerName || '',
                  '{CREATED_BY}': 'Website',
                  '{DATE}': lead.createdAt ? new Date(lead.createdAt).toLocaleString() : ''
                };
                let subject = emailTemplate.subject || 'New Lead Created';
                let htmlBody = emailTemplate.bodyContent || '';
                for (const [key, value] of Object.entries(replacements)) {
                  subject = subject.split(key).join(value);
                  htmlBody = htmlBody.split(key).join(value);
                }
                if (!htmlBody.trim()) {
                  htmlBody = `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                      <h2>New Website Lead</h2>
                      <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Name</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${lead.name}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Mobile</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${lead.mobile}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Email</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${lead.email || 'N/A'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Project</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${displayProjectName || 'N/A'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Source</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${source || 'Website'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Message</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${message || 'N/A'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Assigned To</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${displayOwnerName}</td></tr>
                      </table>
                      <hr />
                      <p style="color: #666; font-size: 12px;">Sent via nexusCRM Lead Management System</p>
                    </div>
                  `;
                }
                htmlBody = `<div style="white-space: pre-line; font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">${htmlBody}</div>`;
                const transporter = nodemailer.createTransport({
                  host: mailSettings.smtpHost,
                  port: mailSettings.smtpPort,
                  secure: mailSettings.smtpPort === 465,
                  auth: mailSettings.smtpAuth === 'True' ? {
                    user: mailSettings.smtpUsername,
                    pass: mailSettings.smtpPassword
                  } : undefined,
                  tls: mailSettings.starttls === 'True' ? { rejectUnauthorized: false } : undefined
                });
                await transporter.sendMail({
                  from: `"${mailSettings.fromName || 'nexusCRM'}" <${mailSettings.fromEmail}>`,
                  to: ownerUser.email,
                  subject: subject,
                  html: htmlBody
                });
                console.log(`Website lead email sent to ${ownerUser.email} for lead ${lead.id}`);
              }
            }
          }
        } catch (emailError) {
          console.error('Failed to send website lead notification email:', emailError.message);
        }
      });
    }
  } catch (error) {
    console.error('Website lead creation failed:', error);
    res.status(500).json({ message: 'Failed to submit enquiry. Please try again later.' });
  }
};

// Public API for campaign leads - GET method (no auth required)
// External websites/forms can use a simple GET URL to submit campaign leads
// Example: /api/public/campaign-leads?name=John&mobile=1234567890&email=john@example.com&project=ProjectX&source=Facebook
exports.campaignLead = async (req, res) => {
  try {
    const { name, mobile, email, project, source, secondarySource, message, campaign } = req.query;

    // Validate required fields
    if (!name || !mobile) {
      return res.status(400).json({ message: 'Name and mobile are required.' });
    }

    // Generate Enquiry ID
    const currentYear = new Date().getFullYear();
    const prefix = `ENQ-${currentYear}-`;
    const lastLeadThisYear = await prisma.lead.findFirst({
      where: { id: { startsWith: prefix } },
      orderBy: { id: 'desc' }
    });
    let nextNumber = 1;
    if (lastLeadThisYear && lastLeadThisYear.id) {
      const lastNumberStr = lastLeadThisYear.id.split('-').pop();
      const lastNumber = parseInt(lastNumberStr, 10);
      if (!isNaN(lastNumber)) nextNumber = lastNumber + 1;
    }
    const leadId = `${prefix}${String(nextNumber).padStart(6, '0')}`;

    // Resolve project name to ID
    let projectId = null;
    let projectName = project || 'General';
    if (project) {
      const projectRec = await prisma.project.findFirst({
        where: { OR: [{ id: project }, { projectName: project }] }
      });
      if (projectRec) {
        projectId = projectRec.id;
        projectName = projectRec.projectName;
      } else {
        projectId = project;
      }
    }

    // Resolve owner via RRQ for the project
    let ownerId = null;
    const adminUser = await prisma.user.findFirst({ where: { username: 'admin' } });
    const defaultOwnerId = adminUser ? adminUser.id : 'admin';

    const rrq = await prisma.rRQ.findFirst({
      where: { projectName, rrqType: 'Presales' }
    });

    if (rrq && rrq.assignedUsers && rrq.assignedUsers.length > 0) {
      const lastLead = await prisma.lead.findFirst({
        where: { OR: [{ project: projectId }, { project: projectName }] },
        orderBy: { createdAt: 'desc' }
      });

      let nextUser = rrq.assignedUsers[0];
      if (lastLead && lastLead.owner) {
        let lastOwnerId = lastLead.owner;
        if (!rrq.assignedUsers.includes(lastLead.owner)) {
          const lastOwnerUser = await resolveUser(lastLead.owner);
          if (lastOwnerUser) lastOwnerId = lastOwnerUser.id;
          else if (lastLead.ownerId) lastOwnerId = lastLead.ownerId;
        }
        let lastIndex = -1;
        for (let i = 0; i < rrq.assignedUsers.length; i++) {
          const au = await resolveUser(rrq.assignedUsers[i]);
          if (au && au.id === lastOwnerId) { lastIndex = i; break; }
        }
        if (lastIndex !== -1) {
          nextUser = rrq.assignedUsers[(lastIndex + 1) % rrq.assignedUsers.length];
        }
      }
      const assignedUser = await resolveUser(nextUser);
      if (assignedUser) ownerId = assignedUser.id;
    }

    if (!ownerId) {
      if (projectId) {
        const projRec = await prisma.project.findUnique({ where: { id: projectId } });
        if (projRec && projRec.developerId) {
          const devUser = await prisma.user.findUnique({ where: { id: projRec.developerId } });
          if (devUser) ownerId = devUser.id;
        }
      }
      if (!ownerId) ownerId = defaultOwnerId;
    }

    // Clean mobile number
    const cleanMobile = String(mobile).replace(/\D/g, '');

    // Determine source - use campaign name or provided source
    const leadSource = source || 'Campaign';
    
    // Build remarks with campaign info
    let remarks = message || '';
    if (campaign) {
      remarks = remarks ? `[Campaign: ${campaign}] ${remarks}` : `Campaign: ${campaign}`;
    }

    // Create the lead
    const lead = await prisma.lead.create({
      data: {
        id: leadId,
        name,
        mobile: cleanMobile,
        email: email || null,
        primarySource: leadSource,
        secondarySource: secondarySource || null,
        status: 'New Lead',
        project: projectId || projectName,
        owner: ownerId,
        ownerId: ownerId,
        remarks: remarks || null,
        logs: {
          create: {
            title: 'Campaign Lead Created',
            subtitle: campaign ? `via campaign: ${campaign}` : 'via campaign form'
          }
        }
      },
      include: { logs: true }
    });

    // Send success response
    res.status(201).json({
      success: true,
      message: 'Campaign lead submitted successfully.',
      leadId: lead.id
    });

    // Send email notification to owner (non-blocking)
    if (ownerId) {
      let displayOwnerName = 'Admin';
      const ownerUserForName = await prisma.user.findUnique({ where: { id: ownerId } });
      if (ownerUserForName) displayOwnerName = ownerUserForName.username || ownerUserForName.firstName || 'Admin';
      const displayProjectName = projectName;

      setImmediate(async () => {
        try {
          const mailSettings = await prisma.mailSetting.findFirst();
          if (mailSettings && mailSettings.smtpHost && mailSettings.enabled) {
            const emailTemplate = await prisma.emailTemplate.findFirst({
              where: { templateKey: 'CREATE_NEW_LEAD_TEMPLATE' }
            });
            if (emailTemplate) {
              const ownerUser = await prisma.user.findUnique({ where: { id: ownerId } });
              if (ownerUser && ownerUser.email) {
                const replacements = {
                  '{OWNER_NAME}': displayOwnerName || '',
                  '{ENQUIRY_ID}': lead.id || '',
                  '{CUSTOMER_NAME}': lead.name || '',
                  '{COMPANY_NAME}': '',
                  '{PHONE}': lead.mobile || '',
                  '{EMAIL}': lead.email || '',
                  '{PROJECT_NAME}': displayProjectName || '',
                  '{SOURCE}': leadSource,
                  '{LEAD_OWNER}': displayOwnerName || '',
                  '{CREATED_BY}': 'Campaign',
                  '{DATE}': lead.createdAt ? new Date(lead.createdAt).toLocaleString() : ''
                };
                let subject = emailTemplate.subject || 'New Campaign Lead Created';
                let htmlBody = emailTemplate.bodyContent || '';
                for (const [key, value] of Object.entries(replacements)) {
                  subject = subject.split(key).join(value);
                  htmlBody = htmlBody.split(key).join(value);
                }
                if (!htmlBody.trim()) {
                  htmlBody = `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                      <h2>New Campaign Lead</h2>
                      <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Name</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${lead.name}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Mobile</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${lead.mobile}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Email</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${lead.email || 'N/A'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Project</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${displayProjectName || 'N/A'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Source</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${leadSource}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Campaign</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${campaign || 'N/A'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Assigned To</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${displayOwnerName}</td></tr>
                      </table>
                      <hr />
                      <p style="color: #666; font-size: 12px;">Sent via nexusCRM Lead Management System</p>
                    </div>
                  `;
                }
                htmlBody = `<div style="white-space: pre-line; font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">${htmlBody}</div>`;
                const transporter = nodemailer.createTransport({
                  host: mailSettings.smtpHost,
                  port: mailSettings.smtpPort,
                  secure: mailSettings.smtpPort === 465,
                  auth: mailSettings.smtpAuth === 'True' ? {
                    user: mailSettings.smtpUsername,
                    pass: mailSettings.smtpPassword
                  } : undefined,
                  tls: mailSettings.starttls === 'True' ? { rejectUnauthorized: false } : undefined
                });
                await transporter.sendMail({
                  from: `"${mailSettings.fromName || 'nexusCRM'}" <${mailSettings.fromEmail}>`,
                  to: ownerUser.email,
                  subject: subject,
                  html: htmlBody
                });
                console.log(`Campaign lead email sent to ${ownerUser.email} for lead ${lead.id}`);
              }
            }
          }
        } catch (emailError) {
          console.error('Failed to send campaign lead notification email:', emailError.message);
        }
      });
    }
  } catch (error) {
    console.error('Campaign lead creation failed:', error);
    res.status(500).json({ message: 'Failed to submit campaign lead. Please try again later.' });
  }
};