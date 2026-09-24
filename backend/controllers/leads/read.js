/* Reading leads: the scoped list, one lead, its summary, site-visit statuses. */
const prisma = require('../../prismaClient');
const { sendError } = require('../../utils/apiError');
const { summariseLead } = require('../../utils/leadInsight');
const { allocatorForViewer } = require('../../utils/leadPeople');
const { isReadOnlyForViewer } = require('../../middleware/leadAccess');

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

    /* ------------------------------------------------------------------
       Who may see what is decided HERE, from the verified session user —
       never from the ?username= query parameter, which any caller could
       set to anyone (or omit entirely) to read another person's list.
       ?username= is still accepted but only ever intersected with the
       session user's own scope, so it can narrow a legitimate view, never
       widen one.
       ------------------------------------------------------------------ */
    const { isSuperUser, isManagerUser } = require('../../middleware/authMiddleware');
    const me = req.user;

    /** Leads owned by any staff member at the given status levels. Old rows
     *  store a username in `owner`, new rows a user id in `ownerId`, so both
     *  forms are matched — the same reason getDashboardStats matches both. */
    const staffOwned = async (statuses) => {
      const users = await prisma.user.findMany({
        where: { status: { in: statuses } },
        select: { id: true, username: true },
      });
      return {
        OR: [
          { ownerId: { in: users.map((u) => u.id) } },
          { owner: { in: users.map((u) => u.username) } },
        ],
      };
    };

    /** Constrain the list to one named person, when ?owner= is set. */
    const applyOwnerParam = (ownerKeys) => {
      if (!ownerKeys) return;
      filters.AND = [
        ...(filters.AND || []),
        { OR: [{ ownerId: { in: ownerKeys } }, { owner: { in: ownerKeys } }] },
      ];
    };

    if (isSuperUser(me)) {
      // Superadmin sees everything; ?owner= narrows.
      if (req.query.owner) {
        const ownerUser = await prisma.user.findFirst({
          where: { OR: [{ username: req.query.owner }, { id: req.query.owner }] },
        });
        applyOwnerParam(ownerUser ? [ownerUser.id, ownerUser.username] : [req.query.owner]);
      }
    } else if (isManagerUser(me)) {
      // Managers see leads owned by managers and employees, never admin-owned.
      filters.AND = [...(filters.AND || []), await staffOwned(['Manager', 'Employee'])];
      if (req.query.owner) {
        const ownerUser = await prisma.user.findFirst({
          where: { OR: [{ username: req.query.owner }, { id: req.query.owner }] },
        });
        applyOwnerParam(ownerUser ? [ownerUser.id, ownerUser.username] : [req.query.owner]);
      }
    } else {
      // Everyone else — including an unknown status — sees only their own
      // leads. Default-deny: a status this app does not recognise must never
      // read as "sees everything".
      if (req.query.owner) {
        // Asking for someone else's leads is refused with an empty list —
        // the filter cannot be used to probe, and returning the caller's own
        // rows here would silently ignore what was asked for.
        const ownerUser = await prisma.user.findFirst({
          where: { OR: [{ username: req.query.owner }, { id: req.query.owner }] },
        });
        const isSelf = ownerUser ? ownerUser.id === me.id : req.query.owner === me.username;
        if (!isSelf) {
          return res.status(200).json([]);
        }
      }
      applyOwnerParam([me.id, me.username]);
    }

    // ?username= is advisory: honoured only where the session user already
    // has scope, ignored where it would cross an ownership boundary.
    if (req.query.username && req.query.username !== me.username) {
      const requested = await prisma.user.findUnique({
        where: { username: req.query.username },
        select: { id: true, username: true, status: true },
      });
      if (requested && (isSuperUser(me) || (isManagerUser(me) && requested.status !== 'Admin'))) {
        applyOwnerParam([requested.id, requested.username]);
      } else {
        // Asking for someone else's list without the rank for it: an empty
        // list, so the parameter cannot be used to probe who exists.
        return res.status(200).json([]);
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

    /* The live response deadline for every lead on the page, in one query.
       Asking per row would be a query per lead on a list that routinely runs
       to hundreds. Only rows still 'waiting' are fetched — a lead whose clock
       has been satisfied or stopped simply has no entry, which is exactly how
       the column decides to show nothing. */
    const pending = new Map();
    try {
      const waiting = await prisma.leadAssignment.findMany({
        where: { leadId: { in: leads.map((l) => l.id) }, state: 'waiting' },
        select: { leadId: true, dueAt: true, assignedAt: true, cycle: true },
        orderBy: { cycle: 'asc' },
      });
      // Last write wins, so the highest cycle is the one kept.
      waiting.forEach((a) => pending.set(a.leadId, a));
    } catch (error) {
      // The list must still render if the follow-up state cannot be read.
      console.error('Could not read follow-up deadlines for the lead list:', error.message);
    }

    const now = Date.now();
    const leadsWithResolvedNames = leads.map(lead => {
      const displayOwnerName = userMap[lead.ownerId] || userMap[lead.owner] || lead.owner;
      const displayProjectName = projectMap[lead.project] || lead.project;
      const clock = pending.get(lead.id);
      return {
        ...lead,
        ownerName: displayOwnerName,
        owner: displayOwnerName,
        projectName: displayProjectName,
        project: displayProjectName,  // Override for frontend display compatibility
        /* The deadline, not a countdown: seconds computed here would be stale
           the moment the response left. The browser ticks against the instant. */
        followUp: clock ? {
          dueAt: clock.dueAt,
          assignedAt: clock.assignedAt,
          cycle: clock.cycle,
          ownerName: displayOwnerName,
          overdue: new Date(clock.dueAt).getTime() <= now,
        } : null,
      };
    });

    res.status(200).json(leadsWithResolvedNames);
  } catch (error) {
    sendError(res, error, 'Failed to fetch leads', 500);
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

    /* The live follow-up window, so the record can show who owes a response
       and how long is left. Sent as the deadline rather than a countdown: a
       number of seconds would be wrong the moment it left the server. */
    let followUp = null;
    try {
      const pending = await prisma.leadAssignment.findFirst({
        where: { leadId: lead.id, state: 'waiting' },
        orderBy: { cycle: 'desc' },
      });
      if (pending) {
        followUp = {
          dueAt: pending.dueAt,
          assignedAt: pending.assignedAt,
          ownerName: pending.ownerName || displayOwnerName,
          cycle: pending.cycle,
          source: pending.source,
          overdue: new Date(pending.dueAt) <= new Date(),
        };
      }
    } catch (error) {
      // The record must still open if the follow-up state cannot be read.
      console.error('Could not read the lead follow-up window:', error.message);
    }

    const leadWithResolvedNames = {
      ...lead,
      ownerName: displayOwnerName,
      owner: displayOwnerName,
      projectName: displayProjectName,
      project: displayProjectName,  // Override for frontend display compatibility
      followUp,
      /* Who gave this lead to the person asking, rather than who moved it last.
         The stored value is kept as allocatorOfRecord so nothing is lost — the
         read-only rule and the audit trail both mean the latest mover. */
      allocator: allocatorForViewer(lead, req.user),
      allocatorOfRecord: lead.allocator,
      /* Answered here rather than worked out again in the browser, so the page
         and the API cannot disagree about who may edit. */
      readOnlyForViewer: isReadOnlyForViewer(lead, req.user),
    };
    res.status(200).json(leadWithResolvedNames);
  } catch (error) {
    sendError(res, error, 'Failed to fetch lead', 500);
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
    sendError(res, error, 'Failed to fetch SV statuses', 500);
  }
};

/**
 * The derived view of a lead: score, health, stage and next action.
 *
 * Nothing here is stored. A score in a column goes stale the moment anything
 * it was built from changes, and then two screens disagree about the same
 * lead.
 */
exports.getLeadSummary = async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      include: { logs: { orderBy: { date: 'desc' }, take: 1 } },
    });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const where = { entityType: 'lead', entityId: lead.id };
    const monthAgo = new Date(Date.now() - 30 * 86400000);
    const now = new Date();

    const [activityCount, latestActivity, openTasks, overdueTasks, history] = await Promise.all([
      prisma.activity.count({ where: { ...where, occurredAt: { gte: monthAgo } } }),
      prisma.activity.findFirst({ where, orderBy: { occurredAt: 'desc' }, select: { occurredAt: true } }),
      prisma.task.count({ where: { ...where, status: { not: 'Completed' } } }),
      prisma.task.count({ where: { ...where, status: { not: 'Completed' }, dueDate: { lt: now } } }),
      prisma.stageHistory.findMany({ where, orderBy: { enteredAt: 'asc' } }),
    ]);

    /* The most recent thing that happened, whichever kind it was. A logged
       field change counts: somebody was working the lead. */
    const lastLogAt = lead.logs[0]?.date || null;
    const lastActivityAt = [latestActivity?.occurredAt, lastLogAt]
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a))[0] || null;

    /* How long each stage lasted — until the next move, or until now for the
       one it is in. */
    const timeline = history.map((row, i, all) => {
      const next = all[i + 1];
      const until = next ? new Date(next.enteredAt) : new Date();
      return {
        ...row,
        days: Math.max(0, Math.floor((until - new Date(row.enteredAt)) / 86400000)),
        current: !next,
      };
    });

    const summary = summariseLead(lead, {
      activityCount, lastActivityAt, openTasks, overdueTasks,
    });

    res.status(200).json({ ...summary, lastActivityAt, history: timeline });
  } catch (error) {
    sendError(res, error, 'Could not summarise that lead', 500);
  }
};
