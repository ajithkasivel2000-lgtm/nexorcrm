const prisma = require('../prismaClient');
const { findCompanySuperAdmin } = require('../utils/companyAdmin');
const { sendError } = require('../utils/apiError');
const { deleteEntityRecords } = require('../utils/entityRecords');
const { summariseLead } = require('../utils/leadInsight');
const { recordStageMove } = require('../utils/leadStages');
const { coerceEmails, validateEmail } = require('../utils/email');
const { validatePhone } = require('../utils/phone');
const { notifyImportedLeads } = require('../utils/leadNotify');
const { allocatorForViewer } = require('../utils/leadPeople');
const { isReadOnlyForViewer } = require('../middleware/leadAccess');
const { findDuplicateLead, DUPLICATE_STATUSES } = require('../utils/leadDuplicate');
const { copyFields } = require('../utils/mailRecipients');
const { PRESALES_RRQ_TYPE, SALES_RRQ_TYPE, resolveRrqType } = require('../utils/rrqTypes');
const {
  startAssignmentTimer, recordLeadActivity, cancelPendingFor, isTerminalStatus,
} = require('../utils/leadAssignment');
const { syncSiteVisitFromLead } = require('../utils/siteVisitSync');
const { sendMail } = require('../utils/mailer');
const { intakeLead, IntakeError } = require('../utils/leadIntake');

// ─── Indian mobile validation helper ──────────────────────────────────────────
// Validates and normalizes Indian mobile numbers.
// Accepts: 10-digit string starting with 6/7/8/9, optionally prefixed with +91 or 91.
// Returns the cleaned 10-digit number, or throws on invalid input.
// For optional fields, pass allowEmpty=true to skip validation when value is empty.

// Format a 10-digit mobile number for display as +91 XXXXX XXXXX
/** Every DateTime column on the Lead model. */
const LEAD_DATE_FIELDS = [
  'followUpDate',
  'siteVisitDate',
  'siteVisitConfirmedDate',
  'siteVisitDoneDate',
  'virtualVisitDate',
  'allocatedDate',
];

/**
 * Prisma rejects a string for a DateTime column, so every date on an incoming
 * update has to be coerced before it reaches the query. An empty string — what
 * a cleared date input sends — means "no date", which is null, not ''.
 *
 * Mutates `data` in place. Returns an error message for the caller to send as
 * a 400, or null when everything parsed.
 */
const coerceLeadDates = (data) => {
  for (const key of LEAD_DATE_FIELDS) {
    if (!(key in data)) continue;
    const value = data[key];
    if (value === '' || value === null || value === undefined) {
      data[key] = null;
      continue;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return `${key} is not a valid date`;
    data[key] = parsed;
  }
  return null;
};

/** Field names as a person would read them in the Lead Log. */
const LEAD_FIELD_LABELS = {
  name: 'Name',
  euid: 'EUID',
  mobile: 'Mobile Number',
  email: 'Email',
  alternateNo: 'Alternate Number',
  alternateEmail: 'Alternate Email',
  occupation: 'Occupation',
  companyName: 'Company Name',
  project: 'Project',
  rating: 'Rating',
  owner: 'Lead Owner',
  allocator: 'Allocator',
  allocatedDate: 'Allocated Date',
  followUpDate: 'Follow Up Date',
  virtualVisit: 'Virtual Visit',
  virtualVisitDate: 'Virtual Visit Date',
  primarySource: 'Primary Source',
  secondarySource: 'Secondary Source',
  tertiarySource: 'Tertiary Source',
  channelPartnerName: 'Channel Partner Name',
  channelPartnerId: 'Channel Partner ID',
  referrerDetails: 'Referrer Details',
  sourceUrl: 'Source URL',
  openReason: 'Open Reason',
  callStatus: 'Call Status',
  callRemarks: 'Call Remarks',
  reasonDetails: 'Rejected Reason',
  rejectionType: 'Rejected Reason Subtype',
  siteVisitStatus: 'Site Visit Status',
  siteVisitDate: 'Site Visit Scheduled Date',
  siteVisitNote: 'Site Visit Scheduled Note',
  siteVisitConfirmedDate: 'Site Visit Confirmed Date',
  siteVisitConfirmedNote: 'Site Visit Confirmed Note',
  siteVisitDoneDate: 'Site Visit Done Date',
  siteVisitDoneNote: 'Site Visit Done Note',
  otherNotes: 'Other Notes',
  additionalRemarks: 'Additional Remarks',
  budgetLimit: 'Budget Limit',
  status: 'Status',
};

/** How much of a long note to quote in a log subtitle. */
const LOG_VALUE_MAX = 60;

/** Renders a stored value the way the log should show it. */
const displayLeadValue = (key, value) => {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (LEAD_DATE_FIELDS.includes(key)) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).replace(',', '');
  }
  const text = String(value);
  return text.length > LOG_VALUE_MAX ? `${text.slice(0, LOG_VALUE_MAX)}…` : text;
};

/** Dates compare by instant; everything else by its string form. */
const sameLeadValue = (key, a, b) => {
  if (LEAD_DATE_FIELDS.includes(key)) {
    const ta = a === null || a === undefined || a === '' ? null : new Date(a).getTime();
    const tb = b === null || b === undefined || b === '' ? null : new Date(b).getTime();
    return ta === tb;
  }
  return String(a ?? '') === String(b ?? '');
};

/**
 * Describes what an update actually changed, as one LeadLog row per field.
 *
 * Only fields present in the request are considered, and only when the value
 * really moved — re-saving the same text should not fill the log with noise.
 * The number and its country code are written together, so they read as a
 * single "Mobile Number" change rather than two unrelated ones.
 *
 * `labels` lets the caller pass display names for values stored as IDs (the
 * lead owner, mainly), so the log shows a username instead of a UUID.
 */
const buildLeadChangeLogs = (before, updateData, actor, labels = {}) => {
  const who = actor ? `by ${actor}` : 'by an unknown user';
  const entries = [];
  const handled = new Set();

  const show = (key, value) => labels[`${key}:${value}`] || displayLeadValue(key, value);

  // Mobile number and dial code, as one entry.
  if ('mobile' in updateData || 'mobileCountryCode' in updateData) {
    handled.add('mobile');
    handled.add('mobileCountryCode');
    const numberMoved = 'mobile' in updateData && !sameLeadValue('mobile', before.mobile, updateData.mobile);
    const codeMoved = 'mobileCountryCode' in updateData
      && !sameLeadValue('mobileCountryCode', before.mobileCountryCode, updateData.mobileCountryCode);
    if (numberMoved || codeMoved) {
      const oldFull = `${before.mobileCountryCode || ''} ${before.mobile || ''}`.trim() || '(empty)';
      const nextCode = 'mobileCountryCode' in updateData ? updateData.mobileCountryCode : before.mobileCountryCode;
      const nextNum = 'mobile' in updateData ? updateData.mobile : before.mobile;
      const newFull = `${nextCode || ''} ${nextNum || ''}`.trim() || '(empty)';
      entries.push({
        title: 'Mobile Number Updated',
        subtitle: `${oldFull} → ${newFull} ${who}`,
      });
    }
  }

  for (const key of Object.keys(updateData)) {
    if (handled.has(key)) continue;
    if (!(key in before)) continue;          // not a column we track
    if (key === 'id' || key === 'createdAt' || key === 'updatedAt') continue;
    // A mirror of `owner`, kept in sync by syncOwnerId. "Lead Owner Updated"
    // already says what changed; a second entry for the id would just repeat it.
    if (key === 'ownerId') continue;
    if (sameLeadValue(key, before[key], updateData[key])) continue;

    const label = LEAD_FIELD_LABELS[key] || key;
    entries.push({
      title: `${label} Updated`,
      subtitle: `${show(key, before[key])} → ${show(key, updateData[key])} ${who}`,
    });
  }

  return entries;
};

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

/**
 * Keeps `ownerId` in step with `owner`.
 *
 * A lead carries the owner twice: `owner` — which every edit writes — and
 * `ownerId`, set only at creation. Nothing kept them together, so after a
 * reassignment the row said one thing and `ownerId` still named the previous
 * owner. That is not only a wrong name on the profile: list visibility and the
 * dashboard filter on `ownerId`, so the lead stayed in the old owner's list and
 * notifications went to them.
 *
 * Called before any update that may carry an owner; a no-op otherwise.
 */
const syncOwnerId = async (updateData, before = null, actor = null) => {
  if (!('owner' in updateData)) return null;
  const user = await resolveUser(updateData.owner);
  // Fall back to the raw value: an owner we cannot resolve is still the owner.
  updateData.ownerId = user ? user.id : (updateData.owner || null);

  // Only a real move counts — re-saving the same owner is not a handover.
  const moved = before && actor
    && String(before.owner ?? '') !== String(updateData.owner ?? '');
  if (!moved) return null;

  // Handing the lead to someone else is an allocation, so record who did it.
  updateData.allocator = actor;
  updateData.allocatedDate = new Date();

  const previous = await resolveUser(before.owner);
  return { from: previous ? previous.username : (before.owner || null), by: actor };
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
    const { isSuperUser, isManagerUser } = require('../middleware/authMiddleware');
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

    // Validate mobile if being updated
    if (updateData.mobile !== undefined && updateData.mobile !== null && updateData.mobile !== '') {
      try {
        updateData.mobile = validatePhone(updateData.mobile, updateData.mobileCountryCode);
      } catch (mobileErr) {
        return res.status(400).json({ message: mobileErr.message });
      }
    }

    const dateError = coerceLeadDates(updateData);
    if (dateError) return res.status(400).json({ message: dateError });

    const badEmail = coerceEmails(updateData, [['email', 'Email'], ['alternateEmail', 'Alternate Email']]);
    if (badEmail) return res.status(400).json({ message: badEmail });

    // Who is making the change. Not columns on the lead, so they come out of
    // the payload before it reaches Prisma either way.
    const actor = updateData.username || updateData.changedBy || 'admin';
    delete updateData.username;
    delete updateData.changedBy;

    if (req.body.status || req.body.logEntry) {
      // The log said "by admin" whoever did it, which made it useless for the
      // one question it exists to answer.
      const from = currentLead.status || '(none)';
      logEntryData = {
        title: req.body.logEntry?.title || 'Lead Status Updated',
        subtitle: req.body.logEntry?.subtitle
          || `${from} → ${req.body.status} by ${actor}`,
      };
      delete updateData.logEntry;
    }

    // Reassignment writes `owner`; `ownerId` mirrors it and is what list
    // visibility, the dashboard and notifications actually read.
    const handover = await syncOwnerId(updateData, currentLead, actor);

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

    /* The funnel move, once the save has succeeded. Written only when the
       derived stage actually changed — two statuses can share one stage, and a
       timeline full of moves that went nowhere is worse than none. */
    if ('status' in updateData) {
      await recordStageMove(prisma, {
        entityId: updatedLead.id,
        fromStatus: currentLead.status,
        toStatus: updatedLead.status,
        actor: actor,
      });
    }

    res.status(200).json(leadWithResolvedNames);

    /* A lead passed to a colleague is news to them — the same news as a new
       lead, on the same three channels. Without it the lead just appears in
       their list with nothing to say it arrived. After the response, as
       above: the reassignment is saved whether or not the word got out.

       The follow-up clock is settled here too, in the one place that knows
       what the save actually was: a handover opens a fresh window for the new
       owner, a terminal status stops the clock for good, and anything else the
       owner does is the response that cancels their pending move. */
    setImmediate(async () => {
      try {
        if (isTerminalStatus(updatedLead.status)) {
          await cancelPendingFor(updatedLead.id, `lead is ${updatedLead.status}`);
          return;
        }

        if (handover) {
          /* The new owner gets a full window rather than what was left of the
             previous one, and is told once — by the timer, not by a separate
             notify, so there is one announcement per assignment. */
          await startAssignmentTimer(updatedLead, {
            ownerId: updatedLead.ownerId || updatedLead.owner,
            ownerName: displayOwnerName,
            fromName: handover.from,
            source: 'manual',
            reason: `assigned by ${handover.by}`,
            notify: true,
            notifyContext: {
              ownerName: displayOwnerName,
              projectName: displayProjectName,
              creator: actor,
              handover,
            },
          });
          return;
        }

        await recordLeadActivity(updatedLead.id, {
          actorId: actor,
          actorName: actor,
          kind: 'update',
        });
      } catch (error) {
        console.error('Could not settle the lead follow-up clock:', error.message);
      }
    });

    // Send opportunity conversion notification email (non-blocking - sent after response)
    const isOpportunityUpdate = !!(req.body.status === 'Opportunity' || req.body.siteVisitStatus === 'Opportunity');

    if (isOpportunityUpdate) {
      setImmediate(async () => {
        try {
          const mailSettings = await prisma.mailSetting.findFirst();
          if (mailSettings && mailSettings.smtpHost && mailSettings.enabled) {
            const emailTemplate = await prisma.emailTemplate.findFirst({
              where: { templateKey: 'LEAD_CONVERTED_TO_OPPORTUNITY_TEMPLATE', status: true }
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
                  '{Leads_ID}': currentLead.id || '',
                  // Older name, still what the saved templates use. See utils/leadNotify.js.
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
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Leads ID</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${currentLead.id}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Customer</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${currentLead.name}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Project</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${displayProjectName || currentLead.project || 'N/A'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Assigned To</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${displayOwnerName}</td></tr>
                      </table>
                      <hr />
                      <p style="color: #666; font-size: 12px;">Sent via NexorCRM Lead Management System</p>
                    </div>
                  `;
                }

                // Wrap body in div to preserve line breaks from plain text templates
                htmlBody = `<div style="white-space: pre-line; font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">${htmlBody}</div>`;

                // The standing CC/BCC from Mail Settings, minus anyone
                // already on the To line; queued for retry if SMTP is down.
                const { fields } = copyFields(mailSettings, ownerUser.email);
                await sendMail({
                  to: ownerUser.email,
                  cc: fields.cc,
                  bcc: fields.bcc,
                  subject,
                  html: htmlBody,
                  category: 'opportunity-notify',
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
    /* A site visit saved from the lead screen now drives the visit record
       itself, which is what sends the internal push, the customer email and
       the reminders, and what records who was told. It replaces the single
       owner-only email that used to live here rather than running alongside
       it — two code paths announcing the same booking is how people get the
       same mail twice. The old email is not lost: the same
       SITE_VISIT_SCHEDULED_TEMPLATE still addresses the internal audience,
       and the customer gets their own, safe version. */
    if (isSiteVisitUpdate) {
      setImmediate(async () => {
        try {
          await syncSiteVisitFromLead(updatedLead, { body: req.body, actor });
        } catch (visitError) {
          console.error('Failed to sync the site visit:', visitError.message);
        }
      });
    }
  } catch (error) {
    sendError(res, error, 'Failed to update lead', 500);
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

exports.updateLeadFields = async (req, res) => {
  try {
    const { logEntry, ...updateData } = req.body;

    // Validate mobile if being updated
    if (updateData.mobile !== undefined && updateData.mobile !== null && updateData.mobile !== '') {
      try {
        updateData.mobile = validatePhone(updateData.mobile, updateData.mobileCountryCode);
      } catch (mobileErr) {
        return res.status(400).json({ message: mobileErr.message });
      }
    }

    if (updateData.alternateNo !== undefined && updateData.alternateNo !== null && updateData.alternateNo !== '') {
      try {
        updateData.alternateNo = validatePhone(updateData.alternateNo, updateData.alternateNoCountryCode, true);
      } catch (mobileErr) {
        return res.status(400).json({ message: mobileErr.message });
      }
    }

    const dateError = coerceLeadDates(updateData);
    if (dateError) return res.status(400).json({ message: dateError });

    const badEmail = coerceEmails(updateData, [['email', 'Email'], ['alternateEmail', 'Alternate Email']]);
    if (badEmail) return res.status(400).json({ message: badEmail });

    // The log records what changed, so the previous values have to be read
    // before the write.
    const existingLead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!existingLead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // The owner is stored as a user id; show usernames in the log instead.
    const ownerLabels = {};
    if ('owner' in updateData) {
      for (const value of [existingLead.owner, updateData.owner]) {
        if (!value || ownerLabels[`owner:${value}`]) continue;
        const user = await resolveUser(value);
        if (user) ownerLabels[`owner:${value}`] = user.username || user.firstName || String(value);
      }
    }

    const actor = req.user?.username || req.headers['x-username'] || null;
    const changeLogs = buildLeadChangeLogs(existingLead, updateData, actor, ownerLabels);

    // Reassignment writes `owner`; `ownerId` mirrors it and is what list
    // visibility, the dashboard and notifications actually read.
    const handover = await syncOwnerId(updateData, existingLead, actor);

    const updatedLead = await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        ...updateData,
        ...(changeLogs.length > 0 && { logs: { create: changeLogs } })
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

    /* The funnel move, once the save has succeeded. Written only when the
       derived stage actually changed — two statuses can share one stage, and a
       timeline full of moves that went nowhere is worse than none. */
    if ('status' in updateData) {
      await recordStageMove(prisma, {
        entityId: updatedLead.id,
        fromStatus: existingLead.status,
        toStatus: updatedLead.status,
        actor: actor,
      });
    }

    res.status(200).json(leadWithResolvedNames);

    /* A lead passed to a colleague is news to them — the same news as a new
       lead, on the same three channels. Without it the lead just appears in
       their list with nothing to say it arrived. After the response, as
       above: the reassignment is saved whether or not the word got out.

       The follow-up clock is settled here too, in the one place that knows
       what the save actually was: a handover opens a fresh window for the new
       owner, a terminal status stops the clock for good, and anything else the
       owner does is the response that cancels their pending move. */
    setImmediate(async () => {
      try {
        if (isTerminalStatus(updatedLead.status)) {
          await cancelPendingFor(updatedLead.id, `lead is ${updatedLead.status}`);
          return;
        }

        if (handover) {
          /* The new owner gets a full window rather than what was left of the
             previous one, and is told once — by the timer, not by a separate
             notify, so there is one announcement per assignment. */
          await startAssignmentTimer(updatedLead, {
            ownerId: updatedLead.ownerId || updatedLead.owner,
            ownerName: displayOwnerName,
            fromName: handover.from,
            source: 'manual',
            reason: `assigned by ${handover.by}`,
            notify: true,
            notifyContext: {
              ownerName: displayOwnerName,
              projectName: displayProjectName,
              creator: actor,
              handover,
            },
          });
          return;
        }

        await recordLeadActivity(updatedLead.id, {
          actorId: actor,
          actorName: actor,
          kind: 'update',
        });
      } catch (error) {
        console.error('Could not settle the lead follow-up clock:', error.message);
      }
    });
  } catch (error) {
    sendError(res, error, 'Failed to update lead', 500);
  }
};

exports.updateLead = async (req, res) => {
  try {
    const { logEntry, ...updateData } = req.body;

    // Validate mobile if being updated
    if (updateData.mobile !== undefined && updateData.mobile !== null && updateData.mobile !== '') {
      try {
        updateData.mobile = validatePhone(updateData.mobile, updateData.mobileCountryCode);
      } catch (mobileErr) {
        return res.status(400).json({ message: mobileErr.message });
      }
    }

    if (updateData.alternateNo !== undefined && updateData.alternateNo !== null && updateData.alternateNo !== '') {
      try {
        updateData.alternateNo = validatePhone(updateData.alternateNo, updateData.alternateNoCountryCode, true);
      } catch (mobileErr) {
        return res.status(400).json({ message: mobileErr.message });
      }
    }

    const dateError = coerceLeadDates(updateData);
    if (dateError) return res.status(400).json({ message: dateError });

    const badEmail = coerceEmails(updateData, [['email', 'Email'], ['alternateEmail', 'Alternate Email']]);
    if (badEmail) return res.status(400).json({ message: badEmail });

    // Reassignment writes `owner`; `ownerId` mirrors it and is what list
    // visibility, the dashboard and notifications actually read. The previous
    // record and the actor tell a real handover from a re-save of the same owner.
    const existingForOwner = 'owner' in updateData
      ? await prisma.lead.findUnique({ where: { id: req.params.id } })
      : null;
    const actorForOwner = req.user?.username || req.headers['x-username'] || 'admin';

    const handover = await syncOwnerId(updateData, existingForOwner, actorForOwner);

    const updatedLead = await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        ...updateData,
        ...(logEntry && {
          logs: {
            create: {
              title: logEntry.title || 'Lead Updated',
              subtitle: logEntry.subtitle || 'by admin'
            }
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

    /* A lead passed to a colleague is news to them — the same news as a new
       lead, on the same three channels. Without it the lead just appears in
       their list with nothing to say it arrived. After the response, as
       above: the reassignment is saved whether or not the word got out. */
    setImmediate(async () => {
      try {
        if (isTerminalStatus(updatedLead.status)) {
          await cancelPendingFor(updatedLead.id, `lead is ${updatedLead.status}`);
          return;
        }
        if (handover) {
          await startAssignmentTimer(updatedLead, {
            ownerId: updatedLead.ownerId || updatedLead.owner,
            ownerName: displayOwnerName,
            fromName: handover.from,
            source: 'manual',
            reason: `assigned by ${handover.by}`,
            notify: true,
            notifyContext: {
              ownerName: displayOwnerName,
              projectName: displayProjectName,
              creator: actorForOwner,
              handover,
            },
          });
          return;
        }
        await recordLeadActivity(updatedLead.id, {
          actorId: actorForOwner,
          actorName: actorForOwner,
          kind: 'update',
        });
      } catch (error) {
        console.error('Could not settle the lead follow-up clock:', error.message);
      }
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Lead not found' });
    }
    sendError(res, error, 'Failed to update lead', 500);
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

exports.deleteLead = async (req, res) => {
  try {
    /* Sub-records and the parent go in one transaction: shared records point
       here by (entityType, entityId), which the database cannot cascade on, so
       two writes would otherwise leave a half-applied delete on a failure. */
    await prisma.$transaction(async (tx) => {
      await deleteEntityRecords('lead', req.params.id, tx);
      await tx.lead.delete({ where: { id: req.params.id } });
    });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Lead not found' });
    }
    sendError(res, error, 'Failed to delete', 500);
  }
};

/* ---------------------------------------------------------------------------
   Public lead endpoints (no sign-in; the company comes from its public key —
   see middleware/companyKey.js). Both go through utils/leadIntake.js, the
   same path Facebook and Google leads take.
   --------------------------------------------------------------------------- */

/** POST /api/public/leads — a website form. */
exports.websiteLead = async (req, res) => {
  try {
    const { name, mobile, mobileCountryCode, email, project, message, source } = req.body || {};
    const lead = await intakeLead({
      name, mobile, mobileCountryCode, email, project,
      primarySource: source || 'Website',
      notes: message,
      creator: 'Website',
      logSubtitle: 'via website form',
    });
    res.status(201).json({
      success: true,
      message: 'Thank you — your enquiry has been received. We will get back to you shortly.',
      leadId: lead.id,
    });
  } catch (error) {
    if (error instanceof IntakeError) return res.status(400).json({ message: error.message });
    console.error('Website lead creation failed:', error);
    res.status(500).json({ message: 'Failed to submit your enquiry. Please try again later.' });
  }
};

/**
 * GET /api/public/campaign-leads?key=&name=&mobile=&email=&project=&source=&campaign=
 * For ad platforms and form tools that can only call a URL.
 */
exports.campaignLead = async (req, res) => {
  try {
    const { name, mobile, mobileCountryCode, email, project, source, secondarySource, message, campaign } = req.query;
    let notes = message || '';
    if (campaign) notes = notes ? `[Campaign: ${campaign}] ${notes}` : `Campaign: ${campaign}`;
    const lead = await intakeLead({
      name, mobile, mobileCountryCode, email, project,
      primarySource: source || 'Campaign',
      secondarySource,
      notes: notes || null,
      creator: 'Campaign',
      logSubtitle: campaign ? `via campaign: ${campaign}` : 'via campaign form',
    });
    res.status(201).json({ success: true, message: 'Campaign lead submitted successfully.', leadId: lead.id });
  } catch (error) {
    if (error instanceof IntakeError) return res.status(400).json({ message: error.message });
    console.error('Campaign lead creation failed:', error);
    res.status(500).json({ message: 'Failed to submit campaign lead. Please try again later.' });
  }
};
