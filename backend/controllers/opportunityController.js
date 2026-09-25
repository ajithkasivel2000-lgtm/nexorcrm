const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { deleteEntityRecords } = require('../utils/entityRecords');
const { coerceEmails } = require('../utils/email');
const { coerceDates } = require('../utils/coerceDates');
const { summarise, STAGE_PROBABILITY } = require('../utils/opportunityHealth');

/** Field names as a person reads them in the audit tab. */
const FIELD_LABELS = {
  stage: 'Stage', status: 'Status', probability: 'Probability',
  expectedValue: 'Expected Value', expectedCloseDate: 'Expected Close Date',
  opportunityOwner: 'Owner', priority: 'Priority', nextAction: 'Next Action',
  nextFollowUpDate: 'Next Follow-up', bookingAmount: 'Booking Amount',
  agreementStatus: 'Agreement Status', invoiceAmount: 'Invoice Amount',
  amountPaid: 'Amount Paid', unitType: 'Unit Type', selectedUnit: 'Selected Unit',
};

/**
 * Columns that say nothing to a reader, or that this code sets itself.
 *
 * Everything else is audited, so adding a field to the model gives it a log
 * entry without anyone remembering to list it here.
 */
const NOT_AUDITED = new Set([
  'id', 'oppId', 'leadId', 'createdAt', 'updatedAt',
  'stageEnteredAt', 'closedAt', 'logs', 'logEntry', 'username',
  'mobileCountryCode', 'alternateMobileCountryCode',
]);

/** How a value reads in the log. */
const shown = (v) => {
  if (v === null || v === undefined || v === '') return '(empty)';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
};

/** Every DateTime column on the Opportunity model. */
const OPPORTUNITY_DATES = [
  'bookingDate', 'bookingDoneDate',
  'agreementDate', 'registrationDate', 'invoiceDate', 'nextDueDate',
  // Added with the forecast columns. Leaving one out is silent: the save just
  // fails with a message that names no field.
  'expectedCloseDate', 'nextFollowUpDate', 'stageEnteredAt', 'closedAt',
];
const { validatePhone } = require('../utils/phone');

// Indian mobile validation

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

/**
 * The owner as a username, whatever form it arrives in.
 *
 * Callers send whichever they have to hand — the converting screen sends the
 * lead ownerId when it has one, so usually an id. Storing whichever turned up
 * left the column holding two different kinds of value, and every query that
 * filters by owner could only ever match one of them.
 *
 * An unrecognised value is passed through rather than nulled: it is somebody's
 * data, and losing the owner outright is worse than keeping one this code does
 * not recognise.
 */
const resolveOwnerUsername = async (ownerIdOrName) => {
  if (!ownerIdOrName) return ownerIdOrName;
  try {
    const user = await prisma.user.findFirst({
      where: { OR: [{ id: String(ownerIdOrName) }, { username: String(ownerIdOrName) }] },
      select: { username: true },
    });
    return user ? user.username : ownerIdOrName;
  } catch {
    return ownerIdOrName;
  }
};

exports.createOpportunity = async (req, res) => {
  try {
    // oppId mirrors the record's own id, which the client extension assigns.
    let opportunityData = { ...req.body };

    const badEmail = coerceEmails(opportunityData, [['emailAddress', 'Email address'], ['alternateEmail', 'Alternate Email']]);
    if (badEmail) return res.status(400).json({ message: badEmail });

    const badCreateDate = coerceDates(opportunityData, OPPORTUNITY_DATES);
    if (badCreateDate) return res.status(400).json({ message: badCreateDate });

    if (req.body.leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: req.body.leadId } });

      /* A named lead that does not exist is a mistake, not a blank slate.
         Skipping the copy and creating the record anyway is how an opportunity
         with no name, no number and no project ends up in the list — and the
         caller is told it succeeded. */
      if (!lead) {
        return res.status(404).json({ message: `Lead ${req.body.leadId} was not found, so no opportunity was created.` });
      }

      opportunityData.opportunityName = lead.name;
      opportunityData.mobileNumber = lead.mobile;
      opportunityData.LeadsProject = lead.project;
      opportunityData.emailAddress = lead.email;
      opportunityData.preferredBudget = lead.budgetLimit;
    }

    // Validate mobile fields
    if (opportunityData.mobileNumber !== undefined && opportunityData.mobileNumber !== null && opportunityData.mobileNumber !== '') {
      try {
        opportunityData.mobileNumber = validatePhone(opportunityData.mobileNumber, opportunityData.mobileCountryCode);
      } catch (mobileErr) {
        return res.status(400).json({ message: mobileErr.message });
      }
    }
    if (opportunityData.alternateMobile !== undefined && opportunityData.alternateMobile !== null && opportunityData.alternateMobile !== '') {
      try {
        opportunityData.alternateMobile = validatePhone(opportunityData.alternateMobile, opportunityData.alternateMobileCountryCode, true);
      } catch (mobileErr) {
        return res.status(400).json({ message: mobileErr.message });
      }
    }

    if (opportunityData.LeadsProject) {
      opportunityData.LeadsProject = await resolveProjectId(opportunityData.LeadsProject);
    }

    /* The owner is stored as a username, because that is what every read of
       this table filters by. The converting screen sends `lead.ownerId ||
       lead.owner`, so it usually arrives as a user id — and a row holding an
       id matched no username, which is why a converted opportunity was
       invisible in the list to its own owner and to everybody else. */
    opportunityData.opportunityOwner = await resolveOwnerUsername(opportunityData.opportunityOwner);

    /* Who performed the conversion, taken from the session rather than the
       payload. The record had no field for this, so the profile printed the
       literal words "by admin" under every opportunity ever created. */
    if (!opportunityData.createdBy && req.user) {
      opportunityData.createdBy = req.user.username || null;
    }

    /* The opening entry of the record's history.
       Nothing wrote an OpportunityLog row before this — the model, its index
       and the label table all existed, but the only "Lead To Opportunity"
       line anybody saw was invented by the profile screen at render time,
       which is why it could not say who did it or what stage it opened in. */
    const openedIn = opportunityData.stage || 'Initiate';
    opportunityData.logs = {
      create: {
        title: 'Lead To Opportunity',
        subtitle: `Converted from lead ${opportunityData.leadId || '(unknown)'} into ${openedIn}`
          + (opportunityData.createdBy ? ` by ${opportunityData.createdBy}` : ''),
        field: 'stage',
        oldValue: null,
        newValue: openedIn,
        actor: opportunityData.createdBy || null,
      },
    };

    const opp = await prisma.opportunity.create({
      data: opportunityData,
      include: { logs: { orderBy: { date: 'desc' } } },
    });
    res.status(201).json(opp);
  } catch (error) {
    sendError(res, error, 'Failed to create opportunity', 500);
  }
};

exports.getOpportunities = async (req, res) => {
  try {
    const filters = {};
    if (req.query.username) {
      const user = await prisma.user.findUnique({ where: { username: req.query.username } });
      if (user) {
        /* Matched on BOTH forms. New rows store a username (see
           createOpportunity), but rows written before that fix hold a user id,
           and an owner filter that knows only one of the two hides the other's
           records completely — which is the bug this list had: every
           opportunity converted from a lead was stored by id and so belonged,
           as far as this query was concerned, to nobody. */
        const bothFormsOf = (rows) => rows.flatMap((u) => [u.username, u.id]).filter(Boolean);

        if (user.status === 'Admin') {
          // Admin: sees opportunities owned by Admin + Manager + Employee
          const allUsers = await prisma.user.findMany({
            where: { status: { in: ['Admin', 'Manager', 'Employee'] } },
            select: { username: true, id: true }
          });
          filters.opportunityOwner = { in: bothFormsOf(allUsers) };
        } else if (user.status === 'Manager') {
          // Manager: sees opportunities owned by Manager + Employee (not Admin)
          const managersAndEmployees = await prisma.user.findMany({
            where: { status: { in: ['Manager', 'Employee'] } },
            select: { username: true, id: true }
          });
          filters.opportunityOwner = { in: bothFormsOf(managersAndEmployees) };
        } else if (user.status === 'Employee') {
          // Employee: sees only their own opportunities
          filters.opportunityOwner = { in: bothFormsOf([user]) };
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

    /* And owner ids to names, the same way. New rows store a username, but the
       ones written before that store an id, and the Owner column showed it raw
       — "USR-2026-006" where a name belongs. */
    const allUsers = await prisma.user.findMany({ select: { id: true, username: true } });
    const ownerMap = {};
    allUsers.forEach(u => {
      ownerMap[u.id] = u.username;
      ownerMap[u.username] = u.username;
    });

    const enrichedOpps = await Promise.all(opps.map(async (opp) => {
      let enrichedOpp = { ...opp };
      if (opp.leadId && (!opp.opportunityName || !opp.mobileNumber || !opp.LeadsProject)) {
        const lead = await prisma.lead.findUnique({ where: { id: opp.leadId } });
        if (lead) {
          enrichedOpp = {
            ...opp,
            opportunityName: opp.opportunityName || lead.name,
            mobileNumber: opp.mobileNumber || lead.mobile,
            LeadsProject: opp.LeadsProject || lead.project,
            emailAddress: opp.emailAddress || lead.email
          };
        }
      }
      // Resolve project ID/name to project name
      enrichedOpp.LeadsProject = projectMap[enrichedOpp.LeadsProject] || enrichedOpp.LeadsProject;
      enrichedOpp.opportunityOwner = ownerMap[enrichedOpp.opportunityOwner] || enrichedOpp.opportunityOwner;
      return enrichedOpp;
    }));

    res.status(200).json(enrichedOpps);
  } catch (error) {
    sendError(res, error, 'Failed to fetch opportunities', 500);
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
    if (opp.leadId && (!opp.opportunityName || !opp.mobileNumber || !opp.LeadsProject)) {
      const lead = await prisma.lead.findUnique({ where: { id: opp.leadId } });
      if (lead) {
        enrichedOpp = {
          ...opp,
          opportunityName: opp.opportunityName || lead.name,
          mobileNumber: opp.mobileNumber || lead.mobile,
          LeadsProject: opp.LeadsProject || lead.project,
          emailAddress: opp.emailAddress || lead.email
        };
      }
    }

    // Resolve project ID/name to project name
    if (enrichedOpp.LeadsProject) {
      const project = await prisma.project.findFirst({
        where: { OR: [{ id: enrichedOpp.LeadsProject }, { projectName: enrichedOpp.LeadsProject }] }
      });
      if (project) {
        enrichedOpp.LeadsProject = project.projectName;
      }
    }

    res.status(200).json(enrichedOpp);
  } catch (error) {
    sendError(res, error, 'Failed to fetch', 500);
  }
};

exports.updateOpportunity = async (req, res) => {
  try {
    const { logEntry, ...updateData } = req.body;

    const badEmail = coerceEmails(updateData, [['emailAddress', 'Email address'], ['alternateEmail', 'Alternate Email']]);
    if (badEmail) return res.status(400).json({ message: badEmail });

    // A date input sends a string, and Prisma rejects it. Without this every
    // save carrying a date failed with a message that named no field.
    const badDate = coerceDates(updateData, OPPORTUNITY_DATES);
    if (badDate) return res.status(400).json({ message: badDate });

    // Validate mobile fields if being updated
    if (updateData.mobileNumber !== undefined && updateData.mobileNumber !== null && updateData.mobileNumber !== '') {
      try {
        updateData.mobileNumber = validatePhone(updateData.mobileNumber, updateData.mobileCountryCode);
      } catch (mobileErr) {
        return res.status(400).json({ message: mobileErr.message });
      }
    }
    if (updateData.alternateMobile !== undefined && updateData.alternateMobile !== null && updateData.alternateMobile !== '') {
      try {
        updateData.alternateMobile = validatePhone(updateData.alternateMobile, updateData.alternateMobileCountryCode, true);
      } catch (mobileErr) {
        return res.status(400).json({ message: mobileErr.message });
      }
    }

    /* Read before writing: an audit entry needs the value that is about to be
       replaced, and it is gone once the update runs. */
    const before = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ message: 'Opportunity not found' });

    const actor = req.user?.username || null; // identity is the session, never a header

    /* A stage change is its own event, not just another edited field. */
    const movedStage = 'stage' in updateData && updateData.stage !== before.stage;
    if (movedStage) {
      updateData.stageEnteredAt = new Date();
      // Carry the stage's usual probability unless the caller set one, so the
      // forecast keeps up with the pipeline on its own.
      if (!('probability' in updateData) && STAGE_PROBABILITY[updateData.stage] !== undefined) {
        updateData.probability = STAGE_PROBABILITY[updateData.stage];
      }
      // Closing is a state of its own, separate from where it sits.
      if (/^Closed/i.test(updateData.stage)) {
        updateData.status = updateData.stage === 'Closed Won' ? 'Won' : 'Lost';
        updateData.closedAt = new Date();
      } else if (before.status && before.status !== 'Open') {
        updateData.status = 'Open';
        updateData.closedAt = null;
      }
    }

    /* One log row per field that actually moved. */
    const changes = Object.keys(updateData)
      .filter((key) => !NOT_AUDITED.has(key))
      // Only real columns: a stray key would be a log entry about nothing.
      .filter((key) => key in before)
      .filter((key) => shown(before[key]) !== shown(updateData[key]))
      .map((key) => ({
        title: `${FIELD_LABELS[key] || key} Updated`,
        subtitle: `${shown(before[key])} → ${shown(updateData[key])}${actor ? ` by ${actor}` : ''}`,
        field: key,
        oldValue: shown(before[key]),
        newValue: shown(updateData[key]),
        actor,
      }));

    const updatePayload = {
      where: { id: req.params.id },
      data: updateData
    };
    /* Both kinds of entry, not one or the other. The explicit logEntry used to
       be assigned over the top of the field rows, so any caller that sent a
       summary line silently threw away the record of what actually changed —
       the stage move included. */
    const rows = [...changes];
    if (logEntry) {
      rows.push({ title: logEntry.title, subtitle: logEntry.subtitle, actor });
    }
    if (rows.length > 0) {
      updatePayload.data.logs = { create: rows };
    }
    const opp = await prisma.opportunity.update(updatePayload);

    /* After the update, so a failed save leaves no history behind. */
    if (movedStage) {
      await prisma.stageHistory.create({
        data: {
          entityType: 'opportunity',
          entityId: opp.id,
          fromStage: before.stage || null,
          toStage: opp.stage,
          probability: opp.probability ?? null,
          changedBy: actor,
        },
      }).catch((e) => console.error('Could not record the stage change:', e.message));
    }

    res.status(200).json(opp);
  } catch (error) {
    sendError(res, error, 'Failed to update', 500);
  }
};

/**
 * The derived view: health, score, weighted value, time in stage.
 *
 * Nothing here is stored. Kept on the server so the record, the list and the
 * dashboard cannot each work it out slightly differently.
 */
exports.getOpportunitySummary = async (req, res) => {
  try {
    const opp = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
    if (!opp) return res.status(404).json({ message: 'Opportunity not found' });

    /* Fetched rather than included: these are shared with leads, so they are
       keyed by (entityType, entityId) and have no relation to follow. */
    const where = { entityType: 'opportunity', entityId: opp.id };
    const now = new Date();

    const [
      stageHistory, activities, latestActivity, tasks, openTasks, overdueTasks,
      notes, contacts, documents, lineItems,
    ] = await Promise.all([
      prisma.stageHistory.findMany({ where, orderBy: { enteredAt: 'asc' } }),
      prisma.activity.count({ where }),
      prisma.activity.findFirst({ where, orderBy: { occurredAt: 'desc' }, select: { occurredAt: true } }),
      prisma.task.count({ where }),
      prisma.task.count({ where: { ...where, status: { not: 'Completed' } } }),
      prisma.task.count({ where: { ...where, status: { not: 'Completed' }, dueDate: { lt: now } } }),
      prisma.note.count({ where }),
      prisma.contact.count({ where }),
      prisma.document.count({ where }),
      prisma.lineItem.findMany({ where, select: { quantity: true, unitPrice: true, discount: true, tax: true } }),
    ]);

    /* What the products on this record come to. Quantity times price, less any
       discount, plus tax — the same arithmetic the products tab shows, done
       here so the two cannot disagree. */
    const lineItemTotal = lineItems.reduce((sum, item) => {
      const qty = Number(item.quantity ?? 0);
      const price = Number(item.unitPrice ?? 0);
      const gross = qty * price;
      const less = Number(item.discount ?? 0);
      const plus = Number(item.tax ?? 0);
      return sum + Math.max(0, gross - less) + plus;
    }, 0);

    const counts = {
      activities,
      lastActivityAt: latestActivity?.occurredAt || null,
      tasks,
      openTasks,
      overdueTasks,
      notes,
      contacts,
      documents,
      lineItems: lineItems.length,
      lineItemTotal: lineItems.length ? lineItemTotal : null,
    };

    /* How long each stage lasted: from when it was entered until the next move,
       or until now for the one it is in. */
    const history = stageHistory.map((row, i, all) => {
      const next = all[i + 1];
      const until = next ? new Date(next.enteredAt) : new Date();
      return {
        ...row,
        days: Math.max(0, Math.floor((until - new Date(row.enteredAt)) / 86400000)),
        current: !next,
      };
    });

    res.status(200).json({ ...summarise(opp, counts), history });
  } catch (error) {
    sendError(res, error, 'Could not summarise that opportunity', 500);
  }
};

exports.deleteOpportunity = async (req, res) => {
  try {
    /* Sub-records and the parent go in one transaction — same shape as the
       lead delete, for the same reason. */
    await prisma.$transaction(async (tx) => {
      await deleteEntityRecords('opportunity', req.params.id, tx);
      await tx.opportunity.delete({ where: { id: req.params.id } });
    });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Opportunity not found' });
    }
    sendError(res, error, 'Failed to delete', 500);
  }
};
// triggering nodemon restart again