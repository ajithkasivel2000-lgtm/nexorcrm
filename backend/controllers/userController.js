const prisma = require('../prismaClient');
const { assertSeatAvailable, SEAT_EXCLUDED } = require('../utils/billing');
const { sendError } = require('../utils/apiError');
const { requestIp } = require('../utils/settings');
const { coerceEmails } = require('../utils/email');
const { checkDeliverable } = require('../utils/emailDomain');
const { coerceDates } = require('../utils/coerceDates');
const { expandedDefaults } = require('../utils/roleDefaults');
const { applyRoleDefaults } = require('../utils/permissions');
const {
  setPermission: setUserPermission, clearAll: clearAllPermissions,
} = require('../utils/permissions');

/* User columns the forms post as plain date strings. */
const USER_DATE_FIELDS = ['dob', 'joiningDate'];

/**
 * Optional columns that are also UNIQUE.
 *
 * A form posts '' for a field somebody left blank, but '' is a value as far as
 * Postgres is concerned while NULL is the absence of one — and a unique index
 * permits many NULLs and exactly one ''. So the first person to save with an
 * empty Employee ID claimed the empty string, and every other user's profile
 * save then failed with "That value is already taken", naming no field.
 *
 * Blank means "not set", so it is stored as NULL.
 */
const NULLABLE_UNIQUE_FIELDS = ['employeeId', 'googleId'];

/** Turns '' into null for the fields where the difference bites. */
function blankUniquesToNull(data) {
  for (const key of NULLABLE_UNIQUE_FIELDS) {
    if (key in data && typeof data[key] === 'string' && data[key].trim() === '') {
      data[key] = null;
    }
  }
}

/**
 * How a role is written for a person to read.
 *
 * The database stores 'Employee' while the application calls that role
 * "User" everywhere it is displayed. Kept alongside the labels above so the
 * server and the UI agree on the wording.
 */
const ROLE_LABELS = { Employee: 'User', superadmin: 'Super Admin' };
const roleLabel = (status) => ROLE_LABELS[status] || status || '—';

/** The reason line stored against a role change. */
function describeRoleChange(from, to, actor) {
  const by = actor ? ` by ${actor}` : '';
  return `Role changed from ${roleLabel(from)} to ${roleLabel(to)}${by}`;
}

/** Human names for the unique columns, so a clash says which field clashed. */
const UNIQUE_FIELD_LABELS = {
  username: 'Username',
  employeeId: 'Employee ID',
  googleId: 'Google account',
};

/**
 * "Employee ID is already used by another user." rather than "That value…".
 *
 * The column is read from `meta.target` where the driver supplies it, and
 * otherwise out of the message — Prisma 7's pg adapter fills in `modelName`
 * and the raw driver error but leaves `target` undefined, so relying on it
 * alone silently produced the generic wording every time.
 */
function uniqueMessage(error) {
  const fromMeta = Array.isArray(error?.meta?.target) ? error.meta.target[0] : error?.meta?.target;
  // "Unique constraint failed on the fields: (`"employeeId"`)"
  const fromText = String(error?.message || '').match(/fields:\s*\(?`?"?([A-Za-z_][\w]*)"?`?\)?/);

  const field = String(fromMeta || fromText?.[1] || '').replace(/["`]/g, '');
  const label = UNIQUE_FIELD_LABELS[field];
  return label
    ? `${label} is already used by another user. Please choose a different one.`
    : 'That value is already taken.';
}
const { validatePhone, normalizeDial } = require('../utils/phone');
const bcrypt = require('bcryptjs');
const { auditFields, auditEvent, recordStatusChange } = require('../utils/userAudit');
const { withoutPassword } = require('../utils/userSafe');

// ─── Shared validation helpers ────────────────────────────────────────────────
const validateUsername = (username) => {
  if (!username) return 'Username is required.';
  if (username.length < 5) return 'Username must be at least 5 characters.';
  return null;
};

const validatePassword = (password) => {
  if (!password) return 'Password is required.';
  if (password.length < 10) return 'Password must be at least 10 characters.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return 'Password must contain at least one special character.';
  return null;
};


// ────────────────────────────────────────────────────────────────────────────
// withoutPassword moved to utils/userSafe.js so every controller strips the
// hash the same way.──

exports.getUsers = async (req, res) => {
  try {
    /* profile_image is left out on purpose.
       It holds the picture itself as a base64 data URI, not a link to one, so
       a single user with a photo made this list 759kB — and it is fetched by
       every screen that needs a name to put against an id: the lead record,
       the RRQ queue, the assignment dialogs, the group editor. Nothing reads
       the picture FROM this list; the two screens that show one (the sidebar
       avatar and the User 360 page) read it from the single-user endpoints,
       which still return it in full.

       Omitted rather than deleted after the fact so Postgres never sends the
       column either. Password goes the same way, which withoutPassword below
       was already doing on its own. */
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      omit: { password: true, profile_image: true, totpSecret: true, totpRecoveryCodes: true, calendarToken: true },
    });
    res.status(200).json(withoutPassword(users));
  } catch (error) {
    sendError(res, error, 'Error fetching users', 500);
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const rawUser = await prisma.user.findUnique({
      where: { id },
      include: { userGroupMembers: { include: { group: true } } }
    });
    const user = rawUser ? {
      ...rawUser,
      userGroups: rawUser.userGroupMembers.map(m => m.group),
      userGroupMembers: undefined
    } : null;
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(withoutPassword(user));
  } catch (error) {
    sendError(res, error, 'Error fetching user', 500);
  }
};

exports.getUserByUsername = async (req, res) => {
  try {
    const { username } = req.params;
    const rawUser = await prisma.user.findUnique({
      where: { username },
      include: { userGroupMembers: { include: { group: true } } }
    });
    const user = rawUser ? {
      ...rawUser,
      userGroups: rawUser.userGroupMembers.map(m => m.group),
      userGroupMembers: undefined
    } : null;
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(withoutPassword(user));
  } catch (error) {
    sendError(res, error, 'Error fetching user by username', 500);
  }
};

exports.createUser = async (req, res) => {
  try {
    const badEmail = coerceEmails(req.body, [['email', 'E-mail']]);
    if (badEmail) return res.status(400).json({ message: badEmail });

    // A well-formed address is not necessarily a reachable one. Every lead
    // notification goes to a user's address, so one saved with a domain that
    // cannot receive mail quietly disables notifications for that person.
    const reach = await checkDeliverable(req.body.email);
    if (!reach.ok) return res.status(400).json({ message: reach.error });

    const {
      username, firstName, firstname, lastName, lastname, email, password,
      phone, dept_id, reporting_to, user_home_path, profile_image,
      ip, lastip
    } = req.body;

    // Validate username
    const usernameErr = validateUsername(username);
    if (usernameErr) return res.status(400).json({ message: usernameErr });

    // Validate password
    const passwordErr = validatePassword(password);
    if (passwordErr) return res.status(400).json({ message: passwordErr });

    // Validate the phone here rather than inside the create call, so an
    // invalid number comes back as the reason it was rejected instead of a
    // generic "Error creating user".
    const phoneCountryCode = normalizeDial(req.body.phoneCountryCode);
    let cleanPhone;
    try {
      cleanPhone = validatePhone(phone, phoneCountryCode, true) || null;
    } catch (phoneErr) {
      return res.status(400).json({ message: phoneErr.message });
    }

    // The id is assigned by the client extension in prismaClient.js.

    const savedUser = await prisma.user.create({
      data: {
        username,
        firstName: firstName || firstname || '',
        lastName: lastName || lastname || '',
        email,
        phone: cleanPhone,
        // Stored alongside the number. Without it a +1 number would read back
        // as +91 and fail validation the next time the record is saved.
        phoneCountryCode,
        password: bcrypt.hashSync(password, 10),
        status: 'Registered',
        userlevel: 0,
        role: 'Registered',
        dept_id: dept_id || null,
        reporting_to: reporting_to || null,
        user_home_path: user_home_path || null,
        profile_image: profile_image || null,
        ip: ip || req.ip || '127.0.0.1',
        lastip: lastip || req.ip || '127.0.0.1'
      }
    });
    res.status(201).json({ ...withoutPassword(savedUser), emailWarning: reach.warning || null });
  } catch (error) {
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'A field';
      return res.status(400).json({ message: `${field} already exists. Please choose a different one.` });
    }
    sendError(res, error, 'Error creating user', 400);
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    // Prevent updating status or IDs via standard update route
    const updateData = { ...req.body };
    delete updateData.status;
    delete updateData.id;

    /* A date input posts "1995-04-12"; Prisma wants a Date for a DateTime
       column and rejects the string outright. That rejection failed the WHOLE
       save with a 400 naming no field — so setting a date of birth or a
       joining date silently lost every other edit on the form with it. Same
       treatment the project and lead controllers already give their dates. */
    const badDate = coerceDates(updateData, USER_DATE_FIELDS);
    if (badDate) return res.status(400).json({ message: badDate });

    // '' is not an Employee ID, it is the absence of one. See the constant.
    blankUniquesToNull(updateData);

    const badEmail = coerceEmails(updateData, [['email', 'E-mail']]);
    if (badEmail) return res.status(400).json({ message: badEmail });

    // Same check as on create: an address that cannot receive mail silently
    // switches off every notification for this user.
    let emailWarning = null;
    if (updateData.email) {
      const reach = await checkDeliverable(updateData.email);
      if (!reach.ok) return res.status(400).json({ message: reach.error });
      emailWarning = reach.warning || null;
    }

    // Validate username if being changed
    if (updateData.username) {
      const usernameErr = validateUsername(updateData.username);
      if (usernameErr) return res.status(400).json({ message: usernameErr });
    }

    // Validate new password only if provided, then hash it. Writing the raw
    // value here is what left plain-text passwords in the table, which in turn
    // made bcrypt.compare() fail at login and locked the account out.
    if (updateData.password) {
      const passwordErr = validatePassword(updateData.password);
      if (passwordErr) return res.status(400).json({ message: passwordErr });
      updateData.password = bcrypt.hashSync(updateData.password, 10);
    }

    // Validate phone if being updated
    if (updateData.phone !== undefined && updateData.phone !== null && updateData.phone !== '') {
      try {
        updateData.phone = validatePhone(updateData.phone, updateData.phoneCountryCode);
      } catch (phoneErr) {
        return res.status(400).json({ message: phoneErr.message });
      }
    }

    if (updateData.userlevel !== undefined && updateData.userlevel !== '') {
      updateData.userlevel = parseInt(updateData.userlevel) || 1;
    }

    // Roles and home paths are privileged fields: only admins change them.
    // The old code let any signed-in caller POST them, which meant a User
    // could hand themselves an Admin badge with one fetch call.
    const privileged = ['userlevel', 'role', 'status', 'user_home_path', 'homePagePath'];
    const isPrivilegedCaller = req.user && (
      req.user.username === 'admin'
      || String(req.user.status || '').toLowerCase() === 'superadmin'
      || req.user.status === 'Admin'
      || (req.user.userlevel || 0) >= 8
    );
    if (!isPrivilegedCaller) {
      for (const key of privileged) delete updateData[key];
    }

    const before = await prisma.user.findUnique({ where: { id } });
    if (!before) return res.status(404).json({ message: 'User not found' });

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData
    });

    // Field-level audit rows, so "Email: a@x.com -> b@x.com" renders from data.
    await auditFields({
      userId: id,
      actor: req.user?.username,
      action: 'USER_UPDATED',
      before,
      after: updatedUser,
      ip: requestIp(req),
    }).catch(() => {});

    // A changed password also matters to the security tab's dates.
    if (updateData.password) {
      await prisma.user.update({ where: { id }, data: { passwordChangedAt: new Date() } }).catch(() => {});
      await auditEvent({ userId: id, actor: req.user?.username, action: 'PASSWORD_CHANGED', field: 'password' }).catch(() => {});
      await prisma.session.deleteMany({ where: { username: updatedUser.username } }).catch(() => {});
    }

    res.status(200).json({ ...withoutPassword(updatedUser), emailWarning });
  } catch (error) {
    // Check if error is related to record not found
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'User not found' });
    }
    /* Name the field. The shared handler answers every unique clash with
       "That value is already taken", which leaves someone staring at a form
       of a dozen fields with no idea which one to change. */
    if (error.code === 'P2002') {
      return res.status(409).json({ message: uniqueMessage(error) });
    }
    return sendError(res, error, 'Error updating user', 400);
  }
};


/**
 * Every column that names a user, and the model it lives on.
 *
 * None of these is a foreign key: each holds a plain username or id, and in
 * practice the same column holds both forms. Anything reassigning or counting
 * a user's work has to match on either.
 */
const USER_REFERENCES = [
  { model: 'lead', field: 'owner', label: 'Leads owned' },
  { model: 'lead', field: 'ownerId', label: 'Leads (owner id)' },
  { model: 'lead', field: 'allocator', label: 'Leads allocated' },
  { model: 'opportunity', field: 'opportunityOwner', label: 'Opportunities owned' },
  { model: 'opportunity', field: 'allocator', label: 'Opportunities allocated' },
  { model: 'opportunity', field: 'reportingManager', label: 'Opportunities (reporting manager)' },
  { model: 'channelPartner', field: 'leadOwner', label: 'Channel partners' },
];

/** The values that identify one user, since columns hold either form. */
const identifiersFor = (user) => [user.username, user.id].filter(Boolean);

/**
 * What a user still holds.
 *
 * GET /api/users/:id/workload
 */
exports.getUserWorkload = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const ids = identifiersFor(user);
    const items = [];
    let total = 0;

    for (const ref of USER_REFERENCES) {
      if (!prisma[ref.model]) continue;
      const count = await prisma[ref.model].count({ where: { [ref.field]: { in: ids } } });
      if (count > 0) { items.push({ ...ref, count }); total += count; }
    }

    res.status(200).json({
      user: { id: user.id, username: user.username, status: user.status },
      total,
      items,
    });
  } catch (error) {
    sendError(res, error, 'Could not work out what this user holds', 500);
  }
};

/**
 * Hands everything a user holds to somebody else.
 *
 * PUT /api/users/:id/reassign  { toUserId }
 *
 * Each column is written with the *same form* the new owner is identified by
 * elsewhere — an id column gets the id, a name column gets the username — so
 * the reassignment does not introduce a third convention.
 */
exports.reassignUserWork = async (req, res) => {
  try {
    const { toUserId } = req.body;
    if (!toUserId) return res.status(400).json({ message: 'Choose who to hand the work to.' });
    if (toUserId === req.params.id) {
      return res.status(400).json({ message: 'Choose a different user to hand the work to.' });
    }

    const [from, to] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.params.id } }),
      prisma.user.findUnique({ where: { id: toUserId } }),
    ]);
    if (!from) return res.status(404).json({ message: 'User not found' });
    if (!to) return res.status(404).json({ message: 'The user you chose no longer exists.' });

    const ids = identifiersFor(from);
    const moved = [];

    /* Every column moves inside one transaction: handing over halfway —
       leads moved, opportunities not — is worse than moving nothing, and a
       failure mid-loop used to leave exactly that. */
    await prisma.$transaction(async (tx) => {
      for (const ref of USER_REFERENCES) {
        if (!tx[ref.model]) continue;
        // An id column takes the new owner's id; everything else takes the name.
        const value = ref.field.toLowerCase().endsWith('id') ? to.id : to.username;
        const result = await tx[ref.model].updateMany({
          where: { [ref.field]: { in: ids } },
          data: { [ref.field]: value },
        });
        if (result.count > 0) moved.push({ ...ref, count: result.count });
      }
    });

    const total = moved.reduce((a, m) => a + m.count, 0);
    res.status(200).json({
      message: total > 0
        ? `Moved ${total} record(s) to ${to.username}.`
        : `${from.username} held nothing to move.`,
      from: from.username,
      to: to.username,
      total,
      moved,
    });
  } catch (error) {
    sendError(res, error, 'Could not hand the work over', 500);
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Refuse while the user still holds work. None of these columns is a
    // foreign key, so the database will not stop the delete — it would just
    // leave leads and opportunities pointing at somebody who is gone.
    // ?force=true is the deliberate override.
    if (req.query.force !== 'true') {
      const ids = identifiersFor(user);
      let held = 0;
      for (const ref of USER_REFERENCES) {
        if (!prisma[ref.model]) continue;
        held += await prisma[ref.model].count({ where: { [ref.field]: { in: ids } } });
      }
      if (held > 0) {
        return res.status(409).json({
          message: `${user.username} still holds ${held} record(s). Hand them to another user first.`,
          held,
        });
      }
    }

    await prisma.user.delete({ where: { id } });
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'User not found' });
    }
    sendError(res, error, 'Error deleting user', 500);
  }
};

exports.deleteInactiveUsers = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await prisma.user.deleteMany({
      where: {
        lastLoginAt: {
          lt: thirtyDaysAgo
        }
      }
    });
    res.status(200).json({
      message: 'Inactive users deleted successfully',
      deletedCount: result.count
    });
  } catch (error) {
    sendError(res, error, 'Error deleting inactive users', 500);
  }
};

exports.activateUsers = async (req, res) => {
  try {
    const { userIds } = req.body;
    if (!userIds || !userIds.length) {
      return res.status(400).json({ message: 'No users selected' });
    }

    // The plan's user limit (utils/billing.js).
    try { await assertSeatAvailable(req.companyId, userIds.length); } catch (limitError) {
      return res.status(limitError.status || 402).json({ message: limitError.message, code: 'PLAN_LIMIT' });
    }
    /* Activation is for accounts waiting on it — Registered/Pending rows from
       sign-up. Scoping the write to those statuses means a hand-picked list of
       ids cannot be used to re-level existing staff, and the reserved admin is
       excluded outright. Level 7 (Employee) is the landing role; real roles
       are granted deliberately through the status ladder. */
    const result = await prisma.user.updateMany({
      where: {
        id: { in: userIds },
        username: { not: 'admin' },
        status: { in: ['Registered', 'Pending'] }
      },
      data: {
        status: 'Employee',
        role: 'Employee',
        userlevel: 7
      }
    });
    // Newly active accounts start with the Employee role's page permissions.
    const activated = await prisma.user.findMany({ where: { id: { in: userIds }, status: 'Employee' }, select: { id: true, permissions: { select: { id: true }, take: 1 } } });
    for (const u of activated) {
      // eslint-disable-next-line no-await-in-loop
      if (!u.permissions.length) await applyRoleDefaults(u.id, 'Employee', req.user?.username || 'system').catch(() => {});
    }
    res.status(200).json({
      message: result.count > 0
        ? `${result.count} user(s) activated.`
        : 'No users were activated — only accounts awaiting activation can be.',
      activated: result.count
    });
  } catch (error) {
    sendError(res, error, 'Error activating users', 500);
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    // Bringing an inactive account back uses a seat.
    if (SEAT_EXCLUDED.includes(user.status) && !['ban', 'suspend', 'archive'].includes(String(action).toLowerCase())) {
      try { await assertSeatAvailable(req.companyId, 1); } catch (limitError) {
        return res.status(limitError.status || 402).json({ message: limitError.message, code: 'PLAN_LIMIT' });
      }
    }

    /* The route is Admin-gated, but the ladder itself needs its own ceiling:
       a plain Admin must not be able to mint another superadmin, and nobody
       may move the superadmin's own account. Self-promotion is refused too —
       a demotion that also clears the role gates is exactly the escalation
       this endpoint exists to prevent. */
    const callerIsSuper = req.user.username === 'admin'
      || String(req.user.status || '').toLowerCase() === 'superadmin';
    const targetIsSuper = user.username === 'admin'
      || String(user.status || '').toLowerCase() === 'superadmin';
    if (targetIsSuper && !callerIsSuper) {
      return res.status(403).json({ message: 'The super admin account cannot be changed.' });
    }
    if (targetIsSuper) {
      return res.status(400).json({ message: 'The super admin role cannot be changed.' });
    }
    if (user.id === req.user.id) {
      return res.status(400).json({ message: 'You cannot change your own role.' });
    }
    if (action === 'promoteToSuperAdmin' && !callerIsSuper) {
      return res.status(403).json({ message: 'Only the super admin can appoint another super admin.' });
    }

    let newStatus = user.status;
    let newUserLevel = user.userlevel || 7;
    const fromStatus = user.status;

    if (action === 'ban') {
      newStatus = 'Banned';
    } else if (action === 'unban') {
      newStatus = 'Manager';
      newUserLevel = 8;
    } else if (action === 'promoteToSuperAdmin') {
      newStatus = 'Admin';
      newUserLevel = 10;
    } else if (action === 'promoteToAdmin') {
      newStatus = 'Admin';
      newUserLevel = 9;
    } else if (action === 'demoteToManager' || action === 'promoteToManager') {
      newStatus = 'Manager';
      newUserLevel = 8;
    } else if (action === 'demoteToRegistered' || action === 'demoteToEmployee' || action === 'promoteToUser') {
      newStatus = 'Employee';
      newUserLevel = 7;
    } else {
      return res.status(400).json({ message: 'Invalid action' });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        status: newStatus,
        userlevel: newUserLevel,
        /* `role` is a second column holding the same fact, and this handler
           never updated it — so a demoted Manager was left as status
           'Employee' with role still reading 'Registered', and anything
           trusting `role` disagreed with the rest of the app. */
        role: newStatus,
      }
    });

    // The lifecycle history and the audit trail, so the User 360 tabs show
    // how the role moved without anyone reconstructing it from memory.
    if (newStatus !== fromStatus) {
      /* The new role's default permissions, applied in the same breath as the
         role itself. Without this a promotion changed a label and nothing
         else: the person kept whatever access they had, and somebody had to
         remember to go and tick fourteen pages by hand.

         It REPLACES their rows rather than merging, which is the point — a
         demotion has to be able to take access away, and a merge could only
         ever add. Anything granted specially to this person is therefore lost
         on a role change, so the response says so and the screen warns before
         asking. */
      try {
        const defaults = expandedDefaults(newStatus);
        if (defaults) {
          await clearAllPermissions(user.id);
          for (const [page, actions] of Object.entries(defaults)) {
            // eslint-disable-next-line no-await-in-loop
            await setUserPermission(user.id, page, actions, req.user?.username || 'system');
          }
        }
      } catch (permError) {
        // A role change that saved must not fail because its defaults did.
        console.error('Could not apply the role default permissions:', permError.message);
      }

      await recordStatusChange({
        userId: user.id,
        fromStatus,
        toStatus: newStatus,
        /* A sentence, not an identifier. This used to store the raw action —
           "Role action: demoteToEmployee" — which was then shown to
           administrators verbatim on the Overview card. */
        reason: describeRoleChange(fromStatus, newStatus, req.user?.username),
        changedBy: req.user?.username,
      }).catch(() => {});
      await auditEvent({
        userId: user.id,
        actor: req.user?.username,
        action: 'ROLE_CHANGED',
        field: 'role',
        oldValue: fromStatus,
        newValue: newStatus,
        ip: requestIp(req),
      }).catch(() => {});
    }

    // A banned or suspended user loses their live sessions immediately.
    if (['Banned', 'Suspended'].includes(newStatus)) {
      await prisma.session.deleteMany({ where: { username: user.username } }).catch(() => {});
    }

    res.status(200).json(withoutPassword(updatedUser));
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'User not found' });
    }
    sendError(res, error, 'Error updating user status', 400);
  }
};

exports.updateUserGroups = async (req, res) => {
  try {
    const { id } = req.params;
    const { groupIds } = req.body;
    if (!Array.isArray(groupIds)) {
      return res.status(400).json({ message: 'groupIds must be an array.' });
    }

    const before = await prisma.user.findUnique({
      where: { id },
      include: { userGroupMembers: true },
    });
    if (!before) return res.status(404).json({ message: 'User not found' });
    const beforeSet = new Set(before.userGroupMembers.map(m => m.groupId));
    const afterSet = new Set(groupIds);

    // Set exactly these groups. New memberships are stamped with who assigned
    // them, which the group tab shows as "Assigned by".
    // Explicitly transactional: the rewrite is delete-everything-then-create,
    // and a bad groupId failing after the delete used to leave the user in no
    // groups at all.
    const rawUpdatedUser = await prisma.$transaction(async (tx) => tx.user.update({
      where: { id },
      data: {
        userGroupMembers: {
          deleteMany: {},
          create: groupIds.map(gId => ({
            groupId: gId,
            assignedBy: req.user?.username || null,
            assignedAt: new Date(),
          }))
        }
      },
      include: {
        userGroupMembers: {
          include: { group: true },
        },
      }
    }));
    const updatedUser = {
      ...rawUpdatedUser,
      userGroups: rawUpdatedUser.userGroupMembers.map(m => m.group),
    };

    // One audit row per group added or removed.
    const actor = req.user?.username;
    const ip = requestIp(req);
    for (const gid of groupIds) {
      if (!beforeSet.has(gid)) {
        const g = rawUpdatedUser.userGroupMembers.find(m => m.groupId === gid)?.group;
        await auditEvent({ userId: id, actor, action: 'GROUP_ADDED', field: 'group', newValue: g?.groupName || gid, ip }).catch(() => {});
      }
    }
    for (const m of before.userGroupMembers) {
      if (!afterSet.has(m.groupId)) {
        await auditEvent({ userId: id, actor, action: 'GROUP_REMOVED', field: 'group', oldValue: m.groupId, ip }).catch(() => {});
      }
    }

    res.status(200).json({ ...withoutPassword(updatedUser), userGroupMembers: undefined });
  } catch (error) {
    sendError(res, error, 'Error updating user groups', 400);
  }
};

exports.updateHomePage = async (req, res) => {
  try {
    const { id } = req.params;
    const { homePagePath } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { homePagePath }
    });
    res.status(200).json(withoutPassword(updatedUser));
  } catch (error) {
    sendError(res, error, 'Error updating home page', 400);
  }
};

exports.searchUsers = async (req, res) => {
  try {
    const { q, status } = req.query;
    if (!q || q.trim().length < 1) {
      return res.status(200).json([]);
    }

    const searchTerm = q.trim();

    // The status param represents the dashboard view role.
    // Return users visible at that level so the dashboard search can find people to view.
    let statusFilter;
    if (status === 'Admin') {
      statusFilter = { in: ['Admin', 'Manager', 'Employee', 'User'] };
    } else if (status === 'Manager') {
      statusFilter = { in: ['Manager', 'Employee', 'User'] };
    } else if (status === 'Employee') {
      statusFilter = { in: ['Employee', 'User'] };
    } else {
      statusFilter = { in: ['Admin', 'Manager', 'Employee', 'User'] };
    }

    const users = await prisma.user.findMany({
      where: {
        status: statusFilter,
        OR: [
          { username: { contains: searchTerm, mode: 'insensitive' } },
          { firstName: { contains: searchTerm, mode: 'insensitive' } },
          { lastName: { contains: searchTerm, mode: 'insensitive' } },
          { id: { contains: searchTerm, mode: 'insensitive' } },
          { email: { contains: searchTerm, mode: 'insensitive' } },
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    res.status(200).json(withoutPassword(users));
  } catch (error) {
    sendError(res, error, 'Error searching users', 500);
  }
};
