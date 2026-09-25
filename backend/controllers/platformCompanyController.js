const bcrypt = require('bcryptjs');
const prisma = require('../prismaClient');
const tenant = require('../utils/tenant');
const { sendError } = require('../utils/apiError');
const { isUsernameTaken } = require('../utils/companyAdmin');

/**
 * Platform → Companies → View / Edit: one client company in detail, its
 * administrators' logins, and the owner's fixes for them (details, email,
 * a new temporary password when theirs is lost).
 *
 * Platform admins only (see platformRoutes). The owner's own company is
 * managed from its own User Admin, not from here.
 *
 *   GET  /api/platform/companies/:id/details
 *   PUT  /api/platform/companies/:id/details
 *   PUT  /api/platform/companies/:id/admins/:userId
 *   POST /api/platform/companies/:id/admins/:userId/reset-password
 */

const ADMIN_STATUSES = ['superadmin', 'Admin'];
const COMPANY_FIELDS = ['name', 'legalName', 'gstin', 'billingEmail', 'phone', 'billingAddress'];
const ADMIN_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'username'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* The same rules as a password set in User Admin. */
function passwordProblem(password) {
  if (!password) return 'Enter a new password.';
  if (password.length < 10) return 'Password must be at least 10 characters.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) return 'Password must contain at least one special character.';
  return null;
}

const adminView = (u) => ({
  id: u.id,
  username: u.username,
  firstName: u.firstName,
  lastName: u.lastName,
  email: u.email,
  phone: u.phone,
  status: u.status,
  // The column defaults to the moment the account was made: that is not a sign-in.
  lastLoginAt: u.lastLoginAt && Math.abs(new Date(u.lastLoginAt) - new Date(u.createdAt)) > 5000 ? u.lastLoginAt : null,
  mustChangePassword: Boolean(u.forcePasswordChange),
  locked: Boolean(u.lockedUntil && new Date(u.lockedUntil) > new Date()),
  createdAt: u.createdAt,
});

/** The company, refusing the owner's own (managed in its own User Admin). */
async function clientCompany(req, res) {
  const company = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!company) { res.status(404).json({ message: 'Company not found' }); return null; }
  if (company.id === req.companyId) {
    res.status(400).json({ message: 'This is your own company. Manage its users from User Admin.' });
    return null;
  }
  return company;
}

/** One of the company's administrators, or null (having answered 404). */
async function companyAdmin(req, res, company) {
  const user = await prisma.user.findFirst({ where: { id: req.params.userId, companyId: company.id } });
  if (!user || !ADMIN_STATUSES.includes(user.status)) {
    res.status(404).json({ message: 'Administrator not found in this company' });
    return null;
  }
  return user;
}

exports.details = (req, res) => tenant.runAsSystem(async () => {
  try {
    const company = await clientCompany(req, res);
    if (!company) return;
    const [admins, users, leads, bookings, projects] = await Promise.all([
      prisma.user.findMany({ where: { companyId: company.id, status: { in: ADMIN_STATUSES } }, orderBy: { createdAt: 'asc' } }),
      prisma.user.count({ where: { companyId: company.id } }),
      prisma.lead.count({ where: { companyId: company.id } }),
      prisma.booking.count({ where: { companyId: company.id } }),
      prisma.project.count({ where: { companyId: company.id } }),
    ]);
    const { accessFor, trialEndOf } = require('../utils/billing');
    const base = String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    res.status(200).json({
      company: {
        ...company,
        access: accessFor(company),
        trialEndsAt: company.subscriptionStatus === 'trialing' ? trialEndOf(company) : null,
      },
      signInUrl: company.customDomain ? `https://${company.customDomain}/` : `${base}/?company=${company.slug}`,
      counts: { users, leads, bookings, projects },
      admins: admins.map(adminView),
    });
  } catch (error) {
    sendError(res, error, 'Could not load the company', 500);
  }
});

exports.updateDetails = (req, res) => tenant.runAsSystem(async () => {
  try {
    const company = await clientCompany(req, res);
    if (!company) return;
    const data = {};
    for (const key of COMPANY_FIELDS) {
      if (req.body?.[key] === undefined) continue;
      const value = String(req.body[key] ?? '').trim();
      data[key] = value || null;
    }
    if ('name' in data && !data.name) return res.status(400).json({ message: 'Company name is required.' });
    if (data.billingEmail && !EMAIL.test(data.billingEmail)) return res.status(400).json({ message: 'Billing email is not valid.' });
    if (data.gstin && !/^[0-9A-Z]{15}$/i.test(data.gstin)) return res.status(400).json({ message: 'GSTIN must be 15 letters and digits.' });
    if (data.gstin) data.gstin = data.gstin.toUpperCase();
    const saved = await prisma.company.update({ where: { id: company.id }, data });
    res.status(200).json(saved);
  } catch (error) {
    sendError(res, error, 'Could not save the company', 400);
  }
});

exports.updateAdmin = (req, res) => tenant.runAsSystem(async () => {
  try {
    const company = await clientCompany(req, res);
    if (!company) return;
    const user = await companyAdmin(req, res, company);
    if (!user) return;

    const data = {};
    for (const key of ADMIN_FIELDS) {
      if (req.body?.[key] === undefined) continue;
      data[key] = String(req.body[key] ?? '').trim() || null;
    }
    if ('firstName' in data && !data.firstName) return res.status(400).json({ message: 'First name is required.' });
    if ('email' in data) {
      if (!data.email || !EMAIL.test(data.email)) return res.status(400).json({ message: 'Enter a valid email address. Password resets are sent there.' });
    }
    if ('username' in data) {
      if (!data.username || !/^[A-Za-z0-9._-]{3,40}$/.test(data.username)) {
        return res.status(400).json({ message: 'Username: 3–40 letters, digits, dots, dashes or underscores.' });
      }
      if (data.username === user.username) delete data.username;
      else if (await isUsernameTaken(data.username)) return res.status(409).json({ message: 'That username is already taken.' });
    }

    const updated = await tenant.runWithCompany(company.id, async () => {
      const row = await prisma.user.update({ where: { id: user.id }, data });
      // Sessions are keyed by username: a renamed account signs in again.
      if (data.username) await prisma.session.deleteMany({ where: { username: user.username } });
      const changes = Object.keys(data).filter((k) => String(user[k] ?? '') !== String(data[k] ?? ''));
      for (const field of changes) {
        await prisma.userAuditLog.create({
          data: { userId: user.id, actor: req.user.username, action: 'update', field, oldValue: user[field] ?? null, newValue: data[field] ?? null, note: 'Changed by the platform owner' },
        }).catch(() => {});
      }
      return row;
    });
    res.status(200).json(adminView(updated));
  } catch (error) {
    sendError(res, error, 'Could not save the administrator', 400);
  }
});

exports.resetAdminPassword = (req, res) => tenant.runAsSystem(async () => {
  try {
    const company = await clientCompany(req, res);
    if (!company) return;
    const user = await companyAdmin(req, res, company);
    if (!user) return;
    const password = String(req.body?.password || '');
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ message: problem });

    await tenant.runWithCompany(company.id, async () => {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: await bcrypt.hash(password, 10),
          // A password someone else chose: they set their own at next sign-in.
          forcePasswordChange: true,
          passwordChangedAt: new Date(),
          lockedUntil: null,
          user_login_attempts: 0,
        },
      });
      // Anyone signed in with the old password is signed out.
      await prisma.session.deleteMany({ where: { username: user.username } });
      await prisma.userAuditLog.create({
        data: { userId: user.id, actor: req.user.username, action: 'password_reset', note: 'Temporary password set by the platform owner' },
      }).catch(() => {});
    });
    res.status(200).json({ message: `New temporary password set for ${user.username}. They must choose their own when they sign in.` });
  } catch (error) {
    sendError(res, error, 'Could not reset the password', 400);
  }
});
