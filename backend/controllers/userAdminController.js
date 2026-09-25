const prisma = require('../prismaClient');
const { assertSeatAvailable, SEAT_EXCLUDED } = require('../utils/billing');
const { sendError } = require('../utils/apiError');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const {
  auditFields, auditEvent, recordStatusChange, wouldCreateReportingCycle,
} = require('../utils/userAudit');
const { notify } = require('./notificationController');
const { sendToUser } = require('../utils/push');
const { withoutPassword } = require('../utils/userSafe');
const { publicSession, idsForHandles } = require('../utils/sessionHandle');
const { requestIp } = require('../utils/settings');
const { resetLoginFailures } = require('../utils/loginAttempts');

/* Everything below serves the User 360° administration centre: the overview
   statistics, the reporting structure, the security actions and the account
   lifecycle. It reads and reuses what already exists — the PageAccess role
   matrix for permissions, SystemLog for login history, the Session table for
   sessions, the USER_REFERENCES ownership columns for CRM statistics — and
   invents nothing that the application does not already track. */


/**
 * The status column doubles as the role in this app (Manager, Employee, Admin
 * are statuses), so "Active" cannot be written literally without breaking the
 * lead-ownership filters that read status. Restoring maps back to the role the
 * user held — kept in the role column — falling back to their level.
 */
const roleForLevel = (level) => (level >= 9 ? 'Admin' : level >= 8 ? 'Manager' : 'Employee');
const KNOWN_ROLES = ['Admin', 'Manager', 'Employee', 'Registered', 'superadmin'];
const activeStatusFor = (user) => {
  if (KNOWN_ROLES.includes(user.role)) return user.role;
  return roleForLevel(user.userlevel || 7);
};

/** The lifecycle statuses an admin may set. Archive is handled separately. */
const LIFECYCLE_STATUSES = ['Active', 'Inactive', 'Pending', 'Suspended', 'Banned', 'Locked'];

const isSuper = (user) => user
  && (user.username === 'admin' || String(user.status || '').toLowerCase() === 'superadmin');
/* Kept local as thin aliases of the shared gates in authMiddleware, so the
   two cannot drift: the route-level requireAdmin/requireManager and these
   controller-side checks answer identically. */
const { isSuperUser, isManagerUser } = require('../middleware/authMiddleware');
const isAdmin = isSuperUser;
const isManager = isManagerUser;

/** The caller ip, in the form the rest of the app stores. */
const ipOf = (req) => requestIp(req) || null;

/**
 * Loads a user with the relations the tabs need, in one place.
 */
async function loadUser(id) {
  return prisma.user.findUnique({
    where: { id },
    include: { userGroupMembers: { include: { group: true } } },
  });
}

/**
 * GET /api/users/:id/overview
 *
 * Everything the header and the overview tab show, in one request: identity,
 * status, security counters, the group list, the manager, the direct reports
 * and the security score computed only from facts that actually exist.
 */
exports.getOverview = async (req, res) => {
  try {
    const user = await loadUser(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [directReports, activeSessions, loginCount, failedCount, statusHistory] = await Promise.all([
      // reporting_to holds an id or a username; count both forms.
      prisma.user.count({ where: { OR: [{ reporting_to: user.id }, { reporting_to: user.username }] } }),
      prisma.session.count({ where: { username: user.username, expiry: { gt: new Date() } } }),
      prisma.systemLog.count({ where: { username: user.username, event: 'LOGIN' } }),
      prisma.systemLog.count({ where: { username: user.username, event: 'LOGIN_FAILED' } }),
      prisma.userStatusHistory.findMany({
        where: { userId: user.id },
        orderBy: { changedAt: 'desc' },
        take: 1,
      }),
    ]);

    // The security score says only what the data can back up. A check that
    // cannot be evaluated in this system is not scored, and its absence in
    // the response is how the UI knows to render it as "not tracked".
    const checks = [];
    const isHashed = typeof user.password === 'string' && user.password.startsWith('$2');
    checks.push({ key: 'password_hashed', label: 'Password stored as a hash', pass: isHashed || user.password === null, weight: 30 });
    checks.push({
      key: 'email_present', label: 'Email address on file', pass: Boolean(user.email), weight: 20,
    });
    checks.push({
      key: 'password_recent', label: 'Password changed in the last 90 days',
      pass: user.passwordChangedAt ? (Date.now() - user.passwordChangedAt.getTime()) < 90 * 86400000 : null,
      weight: 20,
    });
    checks.push({
      key: 'no_lock', label: 'No recent lockouts',
      pass: user.lastFailedLoginAt ? (Date.now() - user.lastFailedLoginAt.getTime()) > 30 * 86400000 : true,
      weight: 15,
    });
    checks.push({
      key: 'has_manager', label: 'Reporting manager assigned', pass: Boolean(user.reporting_to), weight: 15,
    });
    const scored = checks.filter((c) => c.pass !== null);
    const score = scored.reduce((sum, c) => sum + (c.pass ? c.weight : 0), 0);

    const manager = user.reporting_to
      ? await prisma.user.findFirst({
        where: { OR: [{ id: user.reporting_to }, { username: user.reporting_to }] },
        select: { id: true, username: true, firstName: true, lastName: true, designation: true, profile_image: true, status: true },
      })
      : null;

    const dept = user.dept_id
      ? await prisma.department.findFirst({
        where: { OR: [{ id: user.dept_id }, { name: user.dept_id }] },
        select: { id: true, name: true },
      })
      : null;

    res.status(200).json({
      user: withoutPassword(user),
      manager,
      department: dept,
      directReports,
      activeSessions,
      loginCount,
      failedCount,
      securityScore: { score, max: 100, checks },
      statusHistory: statusHistory[0] || null,
      accountAgeDays: user.createdAt ? Math.floor((Date.now() - user.createdAt.getTime()) / 86400000) : 0,
    });
  } catch (error) {
    sendError(res, error, 'Could not load the user overview', 500);
  }
};

/**
 * GET /api/users/:id/stats
 *
 * CRM workload numbers, counted from the same ownership columns the delete
 * flow already knows about (USER_REFERENCES), plus tasks and activities from
 * the shared entity-record tables. Nothing is invented: a module this user has
 * no rows in reports zero.
 */
exports.getStats = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const ids = [user.username, user.id].filter(Boolean);
    const count = (model, field, where = {}) => prisma[model].count({ where: { [field]: { in: ids }, ...where } });

    const [leads, opportunities, customers, channelPartners, tasksOpen, tasksDone, tasksOverdue, activities] = await Promise.all([
      count('lead', 'ownerId'),
      count('opportunity', 'opportunityOwner'),
      // Customers have no owner column — the CRM tracks them through leads
      // and opportunities — so the stat is not offered rather than faked.
      Promise.resolve(0),
      count('channelPartner', 'leadOwner'),
      prisma.task.count({ where: { assignedTo: { in: ids }, status: { in: ['Open', 'In Progress'] } } }),
      prisma.task.count({ where: { assignedTo: { in: ids }, status: 'Completed' } }),
      prisma.task.count({
        where: { assignedTo: { in: ids }, status: { in: ['Open', 'In Progress'] }, dueDate: { lt: new Date() } },
      }),
      count('activity', 'createdBy'),
    ]);

    res.status(200).json({
      leads, opportunities, customers, channelPartners,
      tasks: { open: tasksOpen, completed: tasksDone, overdue: tasksOverdue },
      activities,
    });
  } catch (error) {
    sendError(res, error, 'Could not load the user statistics', 500);
  }
};

/**
 * PUT /api/users/:id/manager
 *
 * Sets or clears the reporting manager. The cycle check walks the chain
 * upwards, so A can never end up managed by someone who is managed by A.
 */
exports.setManager = async (req, res) => {
  try {
    // Managers may rearrange reporting lines within their people, matching
    // what the legacy edit form let them do.
    if (!isManager(req.user)) return res.status(403).json({ message: 'You do not have permission to change reporting lines.' });

    const { managerId } = req.body; // '' | null clears it
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    let manager = null;
    if (managerId) {
      manager = await prisma.user.findFirst({ where: { OR: [{ id: managerId }, { username: managerId }] } });
      if (!manager) return res.status(404).json({ message: 'That manager does not exist.' });
      if (manager.id === user.id) return res.status(400).json({ message: 'A user cannot report to themselves.' });
      // If the new manager sits anywhere below this user in the chain, the
      // edge would close a loop.
      if (await wouldCreateReportingCycle(user.id, manager.id)) {
        return res.status(400).json({
          message: `That would create a circular reporting line: ${manager.username} already reports (directly or indirectly) to ${user.username}.`,
        });
      }
    }

    const before = { reporting_to: user.reporting_to };
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { reporting_to: manager ? manager.id : null },
    });
    await auditFields({
      userId: user.id,
      actor: req.user.username,
      action: 'MANAGER_CHANGED',
      before,
      after: { reporting_to: updated.reporting_to },
      ip: ipOf(req),
    });

    res.status(200).json({ user: withoutPassword(updated), manager: manager ? { id: manager.id, username: manager.username } : null });
  } catch (error) {
    sendError(res, error, 'Could not set the reporting manager', 400);
  }
};

/**
 * PUT /api/users/:id/designation — designation, department, employee id and
 * the rest of the professional block, changed as one edit.
 */
exports.setOrganization = async (req, res) => {
  try {
    // Managers could always edit user records here, so organizational fields
    // stay at Manager; role and password stay Admin-only.
    if (!isManager(req.user)) return res.status(403).json({ message: 'You do not have permission to change organizational fields.' });

    const allowed = ['designation', 'dept_id', 'employeeId', 'branch', 'location', 'joiningDate', 'employmentType', 'team'];
    const data = {};
    for (const key of allowed) {
      if (key in req.body) {
        if (key === 'joiningDate') {
          data[key] = req.body[key] ? new Date(req.body[key]) : null;
        } else {
          data[key] = req.body[key] === '' ? null : req.body[key];
        }
      }
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const before = Object.fromEntries(Object.keys(data).map((k) => [k, user[k]]));
    const updated = await prisma.user.update({ where: { id: user.id }, data });
    await auditFields({
      userId: user.id,
      actor: req.user.username,
      action: 'ORGANIZATION_UPDATED',
      before,
      after: data,
      ip: ipOf(req),
    });
    res.status(200).json(withoutPassword(updated));
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ message: 'That employee ID is already in use.' });
    sendError(res, error, 'Could not update the organizational fields', 400);
  }
};

/**
 * PUT /api/users/:id/status
 *
 * The account lifecycle: Active, Inactive, Pending, Suspended, Banned, Locked.
 * Records who changed it, when and why; disables on suspend/ban, re-enables on
 * Active. Kept separate from the legacy /status role actions, which continue
 * to work untouched.
 */
exports.setLifecycleStatus = async (req, res) => {
  try {
    if (!isManager(req.user)) return res.status(403).json({ message: 'You do not have permission to change account status.' });

    const { status, reason } = req.body;
    if (!LIFECYCLE_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${LIFECYCLE_STATUSES.join(', ')}.` });
    }
    if (status === 'Active') {
      const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { status: true } });
      if (target && SEAT_EXCLUDED.includes(target.status)) {
        try { await assertSeatAvailable(req.companyId, 1); } catch (limitError) {
          return res.status(limitError.status || 402).json({ message: limitError.message, code: 'PLAN_LIMIT' });
        }
      }
    }
    if (['Suspended', 'Banned', 'Locked'].includes(status) && !reason) {
      return res.status(400).json({ message: 'A reason is required when suspending, banning or locking an account.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.id === req.user.id && status !== 'Active') {
      return res.status(400).json({ message: 'You cannot restrict your own account.' });
    }
    // Restricting someone at or above your own level is not delegation, it is
    // a coup: a Manager must not be able to suspend an Admin, and only the
    // superadmin reaches another superadmin's account.
    if (!isSuperUser(req.user) && (String(user.status || '') === 'Admin' || isSuper(user))) {
      return res.status(403).json({ message: 'Only administrators can restrict an administrator.' });
    }
    if (isSuper(user) && !isSuper(req.user) && status !== 'Active') {
      return res.status(403).json({ message: 'The super admin account cannot be restricted.' });
    }

    const from = user.status;
    // Restoring: the role word goes back in status. Restricting: the word
    // goes in as-is and the role column keeps what they were, so unban paths
    // and filters keep working.
    const effectiveStatus = status === 'Active' ? activeStatusFor(user) : status;
    const data = {
      status: effectiveStatus,
      statusReason: reason || null,
      statusChangedAt: new Date(),
      statusChangedBy: req.user.username,
    };
    if (status === 'Active' && !KNOWN_ROLES.includes(user.role)) {
      data.role = effectiveStatus; // keep the role mirror in step when it had drifted
    }
    if (status === 'Locked') {
      data.lockedUntil = req.body.lockMinutes
        ? new Date(Date.now() + req.body.lockMinutes * 60000)
        : new Date(Date.now() + 24 * 60 * 60 * 1000); // default: one day
    }
    if (status === 'Active') {
      data.lockedUntil = null;
      data.user_login_attempts = 0;
    }

    const updated = await prisma.user.update({ where: { id: user.id }, data });
    await recordStatusChange({ userId: user.id, fromStatus: from, toStatus: effectiveStatus, reason, changedBy: req.user.username });
    await auditEvent({
      userId: user.id,
      actor: req.user.username,
      action: 'STATUS_CHANGED',
      field: 'status',
      oldValue: from,
      newValue: effectiveStatus,
      ip: ipOf(req),
      note: reason,
    });

    // Ending the sessions is what makes a suspension bite; the bell tells the
    // person what happened and why.
    if (['Suspended', 'Banned', 'Locked', 'Inactive'].includes(status)) {
      await prisma.session.deleteMany({ where: { username: user.username } });
    }
    await notify(user.id, {
      title: `Your account is now ${effectiveStatus}`,
      body: reason || `An administrator set your account status to ${effectiveStatus}.`,
      kind: 'system',
    });

    res.status(200).json(withoutPassword(updated));
  } catch (error) {
    sendError(res, error, 'Could not change the account status', 400);
  }
};

/**
 * GET /api/users/:id/sessions
 *
 * The user's live sessions for the sessions tab, newest first. Expired rows
 * are skipped, not shown as dead entries.
 */
exports.listSessions = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    // Your own devices, or a manager looking at their people.
    if (user.id !== req.user.id && !isManager(req.user)) {
      return res.status(403).json({ message: 'You do not have permission to view these sessions.' });
    }
    const sessions = await prisma.session.findMany({
      where: { username: user.username, expiry: { gt: new Date() } },
      orderBy: { lastActive: 'desc' },
    });
    res.status(200).json(sessions.map((s) => publicSession(s, req.sessionId)));
  } catch (error) {
    sendError(res, error, 'Could not load the sessions', 500);
  }
};

/**
 * POST /api/users/:id/unlock
 *
 * Clears a lock and the failed-attempt counter.
 */
exports.unlock = async (req, res) => {
  try {
    if (!isManager(req.user)) return res.status(403).json({ message: 'You do not have permission to unlock accounts.' });
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    await prisma.user.update({
      where: { id: user.id },
      data: { lockedUntil: null, user_login_attempts: 0 },
    });
    // Also clear the in-memory per-address streaks, or the next failure from
    // an address that had streaked before the lock would re-lock instantly.
    resetLoginFailures(user.id);
    await auditEvent({
      userId: user.id, actor: req.user.username, action: 'ACCOUNT_UNLOCKED', ip: ipOf(req),
    });
    res.status(200).json({ message: 'Account unlocked.' });
  } catch (error) {
    sendError(res, error, 'Could not unlock the account', 400);
  }
};

/**
 * POST /api/users/:id/reset-password
 *
 * The admin sets a new password — generated when none is supplied — and the
 * user is forced to change it at next login. The generated value is returned
 * once, for the admin to hand over; it is never stored in plain text.
 */
exports.resetPassword = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: 'Only administrators can reset passwords.' });

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    let temporary = null;
    let password = req.body.newPassword;

    if (req.body.generate || !password) {
      // Long but readable: consonant-vowel pairs plus digits, no symbols that
      // get mangled when read out over the phone.
      const pairs = ['ba','be','bi','bo','bu','da','de','di','do','du','ka','ke','ki','ko','ku','la','le','li','lo','lu','ma','me','mi','mo','mu','na','ne','ni','no','nu','ra','re','ri','ro','ru','sa','se','si','so','su','ta','te','ti','to','tu'];
      temporary = 'Nx-' + Array.from({ length: 4 }, () => pairs[crypto.randomInt(pairs.length)]).join('')
        + '-' + crypto.randomInt(1000, 9999) + '!';
      password = temporary;
    } else {
      // Same rules as everywhere else in the app.
      if (String(password).length < 10) return res.status(400).json({ message: 'Password must be at least 10 characters.' });
      if (!/[0-9]/.test(password)) return res.status(400).json({ message: 'Password must contain at least one number.' });
      if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) return res.status(400).json({ message: 'Password must contain at least one special character.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(password, 10),
        passwordChangedAt: new Date(),
        forcePasswordChange: req.body.forceChange !== false,
        lockedUntil: null,
        user_login_attempts: 0,
      },
    });
    resetLoginFailures(user.id);

    // Every live session dies: whoever had the old password no longer has access.
    await prisma.session.deleteMany({ where: { username: user.username } });

    await auditEvent({
      userId: user.id,
      actor: req.user.username,
      action: 'PASSWORD_RESET_BY_ADMIN',
      field: 'password',
      ip: ipOf(req),
      note: req.body.generate || !req.body.newPassword ? 'Temporary password generated' : 'Password set by an administrator',
    });
    await notify(user.id, {
      title: 'Your password was reset by an administrator',
      body: 'Sign in with the new password you were given; you will be asked to set your own.',
      kind: 'security',
    }).catch(() => {});

    res.status(200).json({
      message: 'Password reset. All sessions were revoked.',
      temporaryPassword: temporary, // null when the admin chose the password
      forceChange: req.body.forceChange !== false,
    });
  } catch (error) {
    sendError(res, error, 'Could not reset the password', 400);
  }
};

/**
 * POST /api/users/:id/force-password-change
 * Flags the account so the next login demands a new password.
 */
exports.forcePasswordChange = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: 'Only administrators can do this.' });
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    await prisma.user.update({ where: { id: user.id }, data: { forcePasswordChange: true } });
    await auditEvent({
      userId: user.id, actor: req.user.username, action: 'FORCE_PASSWORD_CHANGE', ip: ipOf(req),
    });
    res.status(200).json({ message: 'The user must change their password at next sign-in.' });
  } catch (error) {
    sendError(res, error, 'Could not flag the account', 400);
  }
};

/**
 * POST /api/users/:id/revoke-sessions  — every session, or all but one.
 * DELETE /api/users/:id/sessions/:sessionId — a single one.
 */
exports.revokeSessions = async (req, res) => {
  try {
    if (!isManager(req.user)) return res.status(403).json({ message: 'You do not have permission to revoke sessions.' });
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const keep = req.body.keepSessionId || null;
    const result = await prisma.session.deleteMany({
      where: { username: user.username, ...(keep ? { id: { not: keep } } : {}) },
    });
    await auditEvent({
      userId: user.id,
      actor: req.user.username,
      action: 'SESSIONS_REVOKED',
      ip: ipOf(req),
      note: keep ? `${result.count} session(s) revoked (one kept)` : `${result.count} session(s) revoked`,
    });
    res.status(200).json({ revoked: result.count });
  } catch (error) {
    sendError(res, error, 'Could not revoke the sessions', 400);
  }
};

exports.revokeSession = async (req, res) => {
  try {
    if (!isManager(req.user)) return res.status(403).json({ message: 'You do not have permission to revoke sessions.' });
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [sessionId] = await idsForHandles([req.params.sessionId], { username: user.username });
    const result = sessionId
      ? await prisma.session.deleteMany({ where: { id: sessionId, username: user.username } })
      : { count: 0 };
    if (result.count === 0) return res.status(404).json({ message: 'That session is already gone.' });
    await auditEvent({
      userId: user.id, actor: req.user.username, action: 'SESSION_REVOKED', ip: ipOf(req),
    });
    res.status(200).json({ revoked: result.count });
  } catch (error) {
    sendError(res, error, 'Could not revoke the session', 400);
  }
};

/**
 * GET /api/users/:id/audit?page=1&limit=25&action=STATUS_CHANGED
 *
 * The field-level audit trail, paged. Deletions are deliberately not offered:
 * an audit trail that participants can edit is not an audit trail.
 */
exports.getAudit = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
    const where = { userId: req.params.id };
    if (req.query.action) where.action = req.query.action;

    const [items, total] = await Promise.all([
      prisma.userAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.userAuditLog.count({ where }),
    ]);
    res.status(200).json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    sendError(res, error, 'Could not load the audit trail', 500);
  }
};

/**
 * GET /api/users/:id/status-history
 */
exports.getStatusHistory = async (req, res) => {
  try {
    const items = await prisma.userStatusHistory.findMany({
      where: { userId: req.params.id },
      orderBy: { changedAt: 'desc' },
      take: 50,
    });
    res.status(200).json(items);
  } catch (error) {
    sendError(res, error, 'Could not load the status history', 500);
  }
};

/**
 * POST /api/users/:id/notify
 *
 * Sends an administrator's message through the existing bell and push
 * channels, honouring the user's notification preferences.
 */
exports.sendNotification = async (req, res) => {
  try {
    if (!isManager(req.user)) return res.status(403).json({ message: 'You do not have permission to send notifications.' });
    const { title, body } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ message: 'A title is required.' });

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const prefs = await prisma.userPreference.findUnique({ where: { userId: user.id } });
    const delivery = { bell: false, push: 'skipped' };

    if (!prefs || prefs.inAppNotifications !== false) {
      const row = await notify(user.id, {
        title: String(title).trim().slice(0, 120),
        body: body ? String(body).slice(0, 500) : null,
        kind: 'system',
      });
      delivery.bell = Boolean(row);
    } else {
      return res.status(400).json({ message: 'This user has turned off in-app notifications.' });
    }

    if (prefs ? prefs.pushNotifications !== false : true) {
      const result = await sendToUser(user.id, {
        title: String(title).trim().slice(0, 120),
        body: body ? String(body).slice(0, 300) : '',
      }).catch(() => null);
      delivery.push = result && !result.skipped ? `sent to ${result.sent} device(s)` : (result?.skipped || 'failed');
    }

    await auditEvent({
      userId: user.id,
      actor: req.user.username,
      action: 'NOTIFICATION_SENT',
      ip: ipOf(req),
      note: String(title).trim().slice(0, 120),
    });
    res.status(200).json({ message: 'Notification sent.', delivery });
  } catch (error) {
    sendError(res, error, 'Could not send the notification', 400);
  }
};

/**
 * GET /api/users/:id/preferences · PUT /api/users/:id/preferences
 *
 * Per-user display and notification choices. Users may set their own; admins
 * may set anyone's.
 */
exports.getPreferences = async (req, res) => {
  try {
    if (req.user.id !== req.params.id && !isManager(req.user)) {
      return res.status(403).json({ message: 'You can only read your own preferences.' });
    }
    let prefs = await prisma.userPreference.findUnique({ where: { userId: req.params.id } });
    if (!prefs) {
      // First read creates the row, so the PUT has something to update and the
      // defaults live in the schema in one place.
      prefs = await prisma.userPreference.create({ data: { userId: req.params.id } }).catch(() => null);
    }
    res.status(200).json(prefs);
  } catch (error) {
    sendError(res, error, 'Could not load the preferences', 500);
  }
};

exports.updatePreferences = async (req, res) => {
  try {
    if (req.user.id !== req.params.id && !isManager(req.user)) {
      return res.status(403).json({ message: 'You can only change your own preferences.' });
    }
    const allowed = ['language', 'timezone', 'dateFormat', 'timeFormat', 'pageSize', 'inAppNotifications', 'pushNotifications', 'emailNotifications', 'categoryPrefs'];
    const data = {};
    for (const key of allowed) if (key in req.body) data[key] = req.body[key];
    if (data.pageSize !== undefined) {
      const n = parseInt(data.pageSize, 10);
      if (!Number.isFinite(n) || n < 10 || n > 200) return res.status(400).json({ message: 'Page size must be between 10 and 200.' });
      data.pageSize = n;
    }

    const prefs = await prisma.userPreference.upsert({
      where: { userId: req.params.id },
      update: data,
      create: { userId: req.params.id, ...data },
    });
    res.status(200).json(prefs);
  } catch (error) {
    sendError(res, error, 'Could not save the preferences', 400);
  }
};

/**
 * POST /api/users/:id/archive — soft delete. Keeps the row, ends sessions,
 * blocks login, and stamps who did it. DELETE continues to exist unchanged for
 * the superadmin, who can still hard-delete through the two-step dialog.
 */
exports.archive = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: 'Only administrators can archive accounts.' });
    const { reason } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (isSuper(user)) return res.status(400).json({ message: 'The super admin account cannot be archived.' });
    if (user.id === req.user.id) return res.status(400).json({ message: 'You cannot archive your own account.' });

    const from = user.status;
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        archivedAt: new Date(),
        archivedBy: req.user.username,
        status: 'Archived',
        statusReason: reason || null,
        statusChangedAt: new Date(),
        statusChangedBy: req.user.username,
      },
    });
    await prisma.session.deleteMany({ where: { username: user.username } });
    await recordStatusChange({ userId: user.id, fromStatus: from, toStatus: 'Archived', reason, changedBy: req.user.username });
    await auditEvent({
      userId: user.id, actor: req.user.username, action: 'USER_ARCHIVED', ip: ipOf(req), note: reason,
    });
    res.status(200).json(withoutPassword(updated));
  } catch (error) {
    sendError(res, error, 'Could not archive the account', 400);
  }
};

/**
 * POST /api/users/:id/unarchive — restores an archived account to Active.
 */
exports.unarchive = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: 'Only administrators can restore accounts.' });
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.archivedAt) return res.status(400).json({ message: 'This account is not archived.' });

    // The plan's user limit (utils/billing.js).
    try { await assertSeatAvailable(req.companyId, 1); } catch (limitError) {
      return res.status(limitError.status || 402).json({ message: limitError.message, code: 'PLAN_LIMIT' });
    }

    const from = user.status;
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        archivedAt: null,
        archivedBy: null,
        status: activeStatusFor(user),
        statusReason: null,
      },
    });
    await recordStatusChange({
      userId: user.id, fromStatus: from, toStatus: updated.status,
      reason: 'Restored from archive', changedBy: req.user.username,
    });
    await auditEvent({
      userId: user.id, actor: req.user.username, action: 'USER_RESTORED', ip: ipOf(req),
    });
    res.status(200).json(withoutPassword(updated));
  } catch (error) {
    sendError(res, error, 'Could not restore the account', 400);
  }
};

/**
 * GET /api/users/:id/reporting — the chain above and the reports below, for
 * the organization tab's visual.
 */
exports.getReporting = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Walk up the chain, resolving whichever form reporting_to holds.
    const chain = [];
    let current = user.reporting_to;
    const seen = new Set([user.id]);
    for (let depth = 0; depth < 10 && current && !seen.has(current); depth += 1) {
      const row = await prisma.user.findFirst({
        where: { OR: [{ id: current }, { username: current }] },
        select: {
          id: true, username: true, firstName: true, lastName: true,
          designation: true, status: true, profile_image: true, reporting_to: true,
        },
      });
      if (!row) break;
      chain.push(row);
      seen.add(row.id);
      current = row.reporting_to;
    }

    const directReports = await prisma.user.findMany({
      where: { OR: [{ reporting_to: user.id }, { reporting_to: user.username }] },
      select: {
        id: true, username: true, firstName: true, lastName: true,
        designation: true, status: true, profile_image: true,
      },
      orderBy: { username: 'asc' },
    });

    const teamPeers = chain[0]
      ? (await prisma.user.findMany({
        where: {
          OR: [{ reporting_to: chain[0].id }, { reporting_to: chain[0].username }],
          NOT: { id: user.id },
        },
        select: { id: true, username: true, firstName: true, lastName: true, status: true },
        take: 20,
      }))
      : [];

    res.status(200).json({ chain, directReports, teamPeers });
  } catch (error) {
    sendError(res, error, 'Could not load the reporting structure', 500);
  }
};

/**
 * POST /api/users/:id/reset-2fa
 *
 * Switches two-factor sign-in off for someone who has lost their phone and
 * their recovery codes. They sign in with their password and can set it up
 * again. Administrators only (see the route); always audited.
 */
exports.resetTwoFactor = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    await prisma.user.update({
      where: { id: user.id },
      data: { totpEnabled: false, totpSecret: null, totpRecoveryCodes: [] },
    });
    await auditEvent({
      userId: user.id, actor: req.user.username, action: 'TWO_FACTOR_RESET', ip: ipOf(req),
      note: 'Two-factor sign-in switched off by an administrator',
    });
    res.status(200).json({ message: `Two-factor sign-in is off for ${user.username}.` });
  } catch (error) {
    sendError(res, error, 'Could not reset two-factor sign-in', 400);
  }
};
