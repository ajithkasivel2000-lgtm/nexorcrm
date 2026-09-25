/* Creating leads: by hand, and in bulk from a spreadsheet. */
const prisma = require('../../prismaClient');
const { findCompanySuperAdmin } = require('../../utils/companyAdmin');
const { sendError } = require('../../utils/apiError');
const { coerceEmails, validateEmail } = require('../../utils/email');
const { validatePhone } = require('../../utils/phone');
const { notifyImportedLeads } = require('../../utils/leadNotify');
const { findDuplicateLead, DUPLICATE_STATUSES } = require('../../utils/leadDuplicate');
const { PRESALES_RRQ_TYPE, SALES_RRQ_TYPE, resolveRrqType } = require('../../utils/rrqTypes');
const { startAssignmentTimer } = require('../../utils/leadAssignment');
const { resolveUser, resolveProjectId, pickLeadFields } = require('./helpers');

exports.createLead = async (req, res) => {
  try {
    // Only the fields a client may set survive. Spreading req.body used to
    // let a payload write any column — id, createdAt, allocator — and the
    // whitelist is the one place that stops it (see pickLeadFields).
    let leadData = pickLeadFields(req.body);

    const badEmail = coerceEmails(leadData, [['email', 'Email'], ['alternateEmail', 'Alternate Email']]);
    if (badEmail) return res.status(400).json({ message: badEmail });

    // The id is assigned by the client extension in prismaClient.js, in the
    // same LED-YYYY-NNN format every other table uses.

    // Validate and normalize mobile number
    try {
      leadData.mobile = validatePhone(leadData.mobile, leadData.mobileCountryCode);
      if (leadData.alternateNo) {
        leadData.alternateNo = validatePhone(leadData.alternateNo, leadData.alternateNoCountryCode, true);
      }
    } catch (mobileErr) {
      return res.status(400).json({ message: mobileErr.message });
    }

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

    // Same project + mobile is a duplicate; same project + email only might
    // be. See utils/leadDuplicate.
    const match = await findDuplicateLead(prisma, {
      mobile: leadData.mobile,
      email: leadData.email,
      projectId: leadData.project,
      projectName: projectNameForCreate,
    });

    if (match) {
      /* Nothing in the duplicate family is given to a salesperson. A repeat —
         settled or likely — goes to the super admin to be looked at first;
         handing it to the queue would put the same customer in two people's
         lists and burn a turn of the rota on a lead that may not be real. */
      leadData.status = match.kind;
      const adminUser = await findCompanySuperAdmin();
      leadData.owner = adminUser ? adminUser.id : 'admin';
      leadData.ownerId = adminUser ? adminUser.id : null;
    }

    // RRQ Logic: assign lead to the next project owner in round-robin sequence
    if (projectNameForCreate && !match && !isEmployeeUser) {
      const rrq = await prisma.rRQ.findFirst({
        where: {
          projectName: projectNameForCreate,
          rrqType: PRESALES_RRQ_TYPE
        }
      });

      if (rrq && rrq.assignedUsers && rrq.assignedUsers.length > 0) {
        // Find the last lead for this project (match both new ID + old name formats)
        const lastLead = await prisma.lead.findFirst({
          where: {
            // Duplicates belong to the super admin, who is not in the rota.
            status: { notIn: DUPLICATE_STATUSES },
            OR: [
              { project: leadData.project },         // New format: project ID
              { project: projectNameForCreate }       // Old format: project name
            ]
          },
          orderBy: { createdAt: 'desc' }
        });

        // Resolve the last owner to a UUID for consistent comparison
        let lastOwnerId = null;
        if (lastLead?.owner) {
          const resolved = await resolveUser(lastLead.owner);
          lastOwnerId = resolved ? resolved.id : (lastLead.ownerId || lastLead.owner);
        }

        // Find last owner's index in assignedUsers by resolving each to UUID
        let lastIndex = -1;
        for (let i = 0; i < rrq.assignedUsers.length; i++) {
          const au = await resolveUser(rrq.assignedUsers[i]);
          if (au && au.id === lastOwnerId) {
            lastIndex = i;
            break;
          }
        }

        let nextUser = rrq.assignedUsers[(lastIndex + 1) % rrq.assignedUsers.length];

        // Resolve next user to UUID before storing
        const assignedUser = await resolveUser(nextUser);
        if (assignedUser) {
          leadData.owner = assignedUser.id;
          leadData.ownerId = assignedUser.id;
        } else {
          // Fallback: store the raw value if user can't be resolved
          leadData.owner = nextUser;
          leadData.ownerId = nextUser;
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
        title: match ? `${match.kind} Lead Created` : 'New Lead Created',
        subtitle: `by ${creator}`
      }
    };

    // Whoever submitted the lead allocated it, even when the RRQ rota picked
    // the owner — they are the reason it landed with that person.
    leadData.allocator = creator;
    leadData.allocatedDate = new Date();

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

    /* Whether the new owner can actually be reached.
     *
     * The round-robin queue picks the owner, so the person filling the form
     * has no idea whether that colleague has notifications switched on or an
     * email address on file. Sending goes on to succeed or fail quietly in the
     * background, which is how "it was assigned" and "nobody was told" ended
     * up looking identical. Two cheap lookups answer it up front. */
    let reachable = null;
    try {
      const owner = await prisma.user.findFirst({
        where: { OR: [{ id: lead.ownerId || lead.owner }, { username: lead.owner }] },
        select: { id: true, username: true, email: true },
      });
      if (owner) {
        const devices = await prisma.pushSubscription.count({ where: { userId: owner.id } });
        reachable = {
          owner: owner.username,
          push: devices > 0,
          email: owner.email || null,
        };
      }
    } catch (error) {
      console.error('Could not check whether the owner is reachable:', error.message);
    }

    /* Why this lead was treated as a repeat, in enough detail for the person
     * who typed it to act on.
     *
     * Without this the lead simply vanished from their view: it saved, then
     * turned into a "Duplicate" owned by somebody else, with nothing said
     * about which earlier Leads it matched or why. */
    let duplicateReport = null;
    if (match) {
      const originalOwner = await resolveUser(match.lead.ownerId || match.lead.owner);
      duplicateReport = {
        kind: match.kind,
        matchedOn: match.matchedOn,
        assignedTo: displayOwnerName,
        project: displayProjectName || null,
        mobile: lead.mobile || null,
        email: lead.email || null,
        original: {
          id: match.lead.id,
          name: match.lead.name || null,
          createdAt: match.lead.createdAt,
          owner: originalOwner ? (originalOwner.username || originalOwner.firstName) : (match.lead.owner || null),
          status: match.lead.status || null,
        },
      };
    }

    const leadWithResolvedNames = {
      ...lead,
      ownerName: displayOwnerName,
      owner: displayOwnerName,
      projectName: displayProjectName,
      project: displayProjectName,
      notify: reachable,
      duplicate: duplicateReport,
    };

    res.status(201).json(leadWithResolvedNames);
    // Telling the owner runs after the response: the lead exists either way,
    // and neither a dead SMTP host nor an unreachable push service should hold
    // up the request or fail it.
    setImmediate(() => {
      /* Opening the follow-up window is what sends the notification, rather
         than a notifyLeadOwner call alongside it: one turn of the clock, one
         announcement. Routing both through here is what stops the owner being
         told twice about the same assignment. */
      startAssignmentTimer(lead, {
        ownerId: lead.ownerId || lead.owner,
        ownerName: displayOwnerName,
        source: 'round-robin',
        notify: true,
        notifyContext: {
          ownerName: displayOwnerName,
          projectName: displayProjectName,
          creator,
        },
      });
    });
  } catch (error) {
    sendError(res, error, 'Failed to create lead', 500);
  }
};

exports.importLeads = async (req, res) => {
  try {
    const { queueType, projectId, leads } = req.body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ message: 'No leads data found to import.' });
    }

    /* Resolved once for the whole import rather than per row: the queue type
       is the same for every lead in the file, and the master only needs
       reading once. Accepts a name from the RRQ Type master or one of the
       slugs the form used to send. */
    const resolvedQueueType = await resolveRrqType(prisma, queueType);
    const isSalesQueue = resolvedQueueType === SALES_RRQ_TYPE;

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
    /* Rows the file offered but that could not become leads. They used to be
       dropped with a console warning, so an import of 200 rows could quietly
       become 160 and the only thing the person saw was "Successfully imported
       160 lead(s)". They are reported back now, with the reason. */
    const skipped = [];
    const ownerNames = new Map();

    /* Whoever ran the import allocated these leads, exactly as the person
       filling in the Create Lead form does — the round-robin picked the owner
       either way, but they are the reason it landed with that person. */
    const importer = req.user?.username || 'Import';
    const importedAt = new Date();

    for (const item of leads) {
      // Support new CSV format: lowercase headers + project ID
      // New format: Leads name, phone number, email id, primary source, secondary source, tertiary source, project id
      // Old format: Leads Name, Phone Number, Primary Source, Secondary Source, Project Interested
      const name = item.name || item['Leads name'] || item['Leads Name'] || item['Name'] || item['Lead Name'];
      const mobile = item.mobile || item['phone number'] || item['Phone Number'] || item['Mobile'] || item['Phone'];
      const email = item.email || item['email id'] || item['Email'] || item['Email Id'] || null;
      const primarySource = item.primarySource || item['primary source'] || item['Primary Source'] || 'Website';
      const secondarySource = item.secondarySource || item['secondary source'] || item['Secondary Source'] || '';
      const tertiarySource = item.tertiarySource || item['tertiary source'] || item['Tertiary Source'] || '';
      const csvProject = item.project || item['project id'] || item['Project Interested'] || item['Project'] || item['project'];

      if (!name || !mobile) {
        skipped.push({ name: name || null, mobile: mobile || null, reason: 'Name and phone number are both required.' });
        continue;
      }

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
        /* The queue to route by, resolved once above from the RRQ Type master
           rather than from a hard-coded pair. A type an administrator adds to
           the master is therefore usable here the moment it exists. */
        const rrqTypeForImport = resolvedQueueType;
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
              status: { notIn: DUPLICATE_STATUSES },
              OR: [
                { project: currentProj.id },
                { project: currentProj.projectName }
              ]
            },
            orderBy: { createdAt: 'desc' }
          });

          // Resolve the last owner to a UUID for consistent comparison
          let lastOwnerId = null;
          if (lastLead?.owner) {
            const resolved = await resolveUser(lastLead.owner);
            lastOwnerId = resolved ? resolved.id : (lastLead.ownerId || lastLead.owner);
          }

          // Find last owner's index in assignedUsers by resolving each to UUID
          let lastIndex = -1;
          for (let i = 0; i < rrq.assignedUsers.length; i++) {
            const au = await resolveUser(rrq.assignedUsers[i]);
            if (au && au.id === lastOwnerId) {
              lastIndex = i;
              break;
            }
          }

          let nextUser = rrq.assignedUsers[(lastIndex + 1) % rrq.assignedUsers.length];
          const assignedUser = await resolveUser(nextUser);
          if (assignedUser) {
            ownerUserId = assignedUser.id;
            ownerUsername = assignedUser.username;
          } else {
            ownerUserId = nextUser;
            ownerUsername = nextUser;
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
        const adminUser = await findCompanySuperAdmin();
        if (adminUser) {
          ownerUserId = adminUser.id;
          ownerUsername = adminUser.username;
        } else {
          ownerUserId = 'admin';
          ownerUsername = 'admin';
        }
      }

      // The id is assigned by the client extension in prismaClient.js.
      let cleanMobile;
      try {
        cleanMobile = validatePhone(mobile, req.body?.mobileCountryCode || req.query?.mobileCountryCode);
      } catch (mobileErr) {
        skipped.push({ name, mobile, reason: mobileErr.message });
        continue;
      }

      /* Untrusted input, same as the website and campaign forms: an address
         that is not an address silently breaks every follow-up mail sent to
         that lead for the rest of its life, so it is checked before it is
         stored rather than discovered later. */
      let cleanEmail;
      try {
        cleanEmail = validateEmail(email, { allowEmpty: true }) || null;
      } catch (emailErr) {
        skipped.push({ name, mobile: cleanMobile, reason: emailErr.message });
        continue;
      }

      const duplicate = await findDuplicateLead(prisma, {
        mobile: cleanMobile,
        email: cleanEmail,
        projectId: currentProj ? currentProj.id : projName,
        projectName: currentProj ? currentProj.projectName : projName,
      });

      // For duplicate leads: reassign owner to admin (same as createLead behavior)
      if (duplicate) {
        const adminUser = await findCompanySuperAdmin();
        ownerUserId = adminUser ? adminUser.id : 'admin';
        ownerUsername = adminUser ? adminUser.username : 'admin';
      }

      // Save into Database
      // - owner stores the User UUID (ID, not name)
      // - ownerId stores the UUID
      // - project stores the Project ID (ID, not name)
      // Rows built here rather than picked from the request: the CSV mapper
      // above already constructs every value explicitly.
      const newLead = await prisma.lead.create({
        data: {
          name,
          email: cleanEmail, mobile: cleanMobile,
          primarySource,
          secondarySource,
          tertiarySource,
          project: currentProj ? currentProj.id : projName,
          /* A sales-queue import is of people already spoken to, so it starts
             at Interested rather than New Lead. Keyed on the resolved type so
             it still holds when the value came from the master ('Sales')
             rather than the old slug ('sales'). */
          status: duplicate ? duplicate.kind : (isSalesQueue ? 'Interested' : 'New Lead'),
          owner: ownerUserId,
          ownerId: ownerUserId,
          allocator: importer,
          allocatedDate: importedAt,
          logs: {
            create: {
              title: duplicate ? `${duplicate.kind} Lead Imported` : 'Lead Imported via CSV',
              subtitle: `Assigned to ${ownerUsername || ownerUserId} by ${importer}`
            }
          }
        }
      });

      importedLeads.push(newLead);
      // Carried alongside, not on the row: startAssignmentTimer wants a name
      // to put on the assignment, and resolving it again per lead would be a
      // second query for something already in hand.
      ownerNames.set(newLead.id, ownerUsername || ownerUserId);
    }

    res.status(200).json({
      message: skipped.length
        ? `Imported ${importedLeads.length} lead(s); ${skipped.length} row(s) could not be imported.`
        : `Successfully imported ${importedLeads.length} lead(s)`,
      count: importedLeads.length,
      skippedCount: skipped.length,
      skipped,
      importedLeads
    });

    setImmediate(async () => {
      /* Open the follow-up window on every imported lead.
       *
       * The reassignment sweep finds work by reading LeadAssignment rows, so a
       * lead without one is invisible to it forever. Import was the only way
       * into the system that never opened a turn: a lead typed into the form
       * moved on by itself when it went unanswered, while the same lead
       * arriving in a CSV sat with its first owner indefinitely.
       *
       * notify is false here on purpose. startAssignmentTimer announces the
       * assignment when it opens the window, which is right for one lead at a
       * time; a three-hundred-row import would be three hundred emails. The
       * announcing is left to notifyImportedLeads below, which collapses a
       * batch for one person into a single summary.
       */
      for (const lead of importedLeads) {
        await startAssignmentTimer(lead, {
          ownerId: lead.ownerId || lead.owner,
          ownerName: ownerNames.get(lead.id) || null,
          source: 'round-robin',
          notify: false,
        });
      }

      // Imported leads are assigned by the same round-robin queue as any other,
      // so their owners are told the same way. A large batch for one person
      // becomes a single summary rather than one email per row.
      await notifyImportedLeads(importedLeads, {
        creator: importer,
        projectNameFor: () => (targetProject ? targetProject.projectName : null),
      });
    });
  } catch (error) {
    console.error('Failed to import leads:', error);
    sendError(res, error, 'Failed to import leads', 500);
  }
};
