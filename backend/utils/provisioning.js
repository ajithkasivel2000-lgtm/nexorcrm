const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../prismaClient');
const tenant = require('./tenant');
const { isUsernameTaken } = require('./companyAdmin');
const { deleteCompanies } = require('./companyDelete');
const { TRIAL_DAYS } = require('./billing');

/**
 * Setting up a company: the Company row, its first administrator, and the
 * lists every screen expects to find filled in (lead statuses, sources, call
 * outcomes, RRQ types...). Used by the platform admin screen and by
 * scripts/seedDefaults.js.
 *
 * Email templates are copied from the template company (TEMPLATE_COMPANY_ID,
 * default the original company) so a new customer starts with the wording the
 * platform owner has already written and tested.
 */

const DEFAULT_MASTERS = {
  leadStatus: { field: 'statusName', values: ['New Lead', 'Attempted', 'Interested', 'Site Visit', 'Allocate', 'Rejected'] },
  callStatus: { field: 'statusName', values: ['Not Reachable', 'Busy', 'Switched Off', 'Call Back Later', 'Wrong Number', 'No Answer'] },
  primarySource: { field: 'sourceName', values: ['Digital Marketing', 'Channel partner', 'Outdoor Marketing', 'Direct Walk In', 'Website', 'Campaign'] },
  secondarySource: { field: 'sourceName', values: ['Website', 'Social Media', 'Event', 'Facebook', 'Google Ads', 'Referral'] },
  rRQType: { field: 'typeName', values: ['Presales', 'Sales'] },
  projectStatus: { field: 'statusName', values: ['Pre Launch', 'Launch', 'Under Construction', 'Ready to Move'] },
  projectType: { field: 'typeName', values: ['Apartment', 'Villa', 'Plots', 'Commercial'] },
  department: { field: 'name', values: ['Sales', 'Marketing', 'Operations', 'Finance', 'Human Resources', 'Administration'] },
};

const newPublicKey = () => crypto.randomBytes(24).toString('hex');

const slugify = (value) => String(value || '').toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/**
 * Fill any empty default list for the CURRENT company. Lists that already
 * have entries are left exactly as they are — this never overwrites what a
 * company has made its own.
 */
async function seedDefaults() {
  const filled = [];
  for (const [model, { field, values }] of Object.entries(DEFAULT_MASTERS)) {
    if (await prisma[model].count() > 0) continue;
    for (const value of values) await prisma[model].create({ data: { [field]: value } });
    filled.push(model);
  }

  if (await prisma.emailTemplate.count() === 0) {
    const sourceId = process.env.TEMPLATE_COMPANY_ID || tenant.DEFAULT_COMPANY_ID;
    if (sourceId !== tenant.currentCompanyId()) {
      const templates = await tenant.runWithCompany(sourceId, () => prisma.emailTemplate.findMany());
      for (const t of templates) {
        await prisma.emailTemplate.create({
          data: {
            name: t.name, subject: t.subject, templateKey: t.templateKey,
            type: t.type, status: t.status, bodyContent: t.bodyContent,
          },
        });
      }
      if (templates.length) filled.push('emailTemplate');
    }
  }
  return filled;
}

/**
 * Create a company with its first administrator and default lists.
 *
 * @param {object} input { name, slug?, plan?, admin: { username, email, password, firstName, lastName? } }
 * @returns {Promise<{ company, admin }>}
 */
async function provisionCompany(input) {
  const name = String(input?.name || '').trim();
  if (!name) throw Object.assign(new Error('Company name is required.'), { status: 400 });
  const slug = slugify(input.slug || name);
  if (!slug) throw Object.assign(new Error('Company slug is required.'), { status: 400 });

  const admin = input.admin || {};
  const username = String(admin.username || '').trim();
  if (!username || !admin.password || !admin.email) {
    throw Object.assign(new Error('The first administrator needs a username, email and password.'), { status: 400 });
  }
  if (String(admin.password).length < 10) {
    throw Object.assign(new Error('The administrator password must be at least 10 characters.'), { status: 400 });
  }
  if (await isUsernameTaken(username)) {
    throw Object.assign(new Error('That username is already taken.'), { status: 409 });
  }
  const slugTaken = await prisma.company.findUnique({ where: { slug } });
  if (slugTaken) throw Object.assign(new Error('That company slug is already in use.'), { status: 409 });

  // The selected plan sets the user limit; self-signups wait for Cashfree
  // authorization before their trial becomes usable.
  const planKey = input.planKey || 'growth';
  const plan = await prisma.plan.findUnique({ where: { key: planKey } });
  if (!plan) throw Object.assign(new Error('Unknown plan.'), { status: 400 });

  /* Verify-first mode (self-signup): company and admin are created in a
     Pending state, and the 24-hour token is attached. Email verification and
     Cashfree mandate activation are independent prerequisites for access. */
  const verifyFirst = input.verifyBeforeActivate === true;
  const verificationToken = verifyFirst ? crypto.randomBytes(32).toString('hex') : null;
  const verificationExpiresAt = verifyFirst ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
  const subscriptionStatus = input.subscriptionStatus || 'trialing';
  const trialEndsAt = subscriptionStatus === 'pending_payment'
    ? (input.trialEndsAt ? new Date(input.trialEndsAt) : null)
    : (verifyFirst ? null : new Date(Date.now() + TRIAL_DAYS * 86400000));

  const company = await prisma.company.create({
    data: {
      name, slug, plan: plan.name, planKey: plan.key,
      status: verifyFirst ? 'Pending' : 'Active',
      publicKey: newPublicKey(),
      subscriptionStatus,
      trialEndsAt,
      nextBillingAt: subscriptionStatus === 'pending_payment' ? trialEndsAt : null,
      subscriptionAmountPaise: subscriptionStatus === 'pending_payment' ? plan.pricePaise : null,
      billingCycle: subscriptionStatus === 'pending_payment' ? 'MONTH' : null,
      signupRequestKey: input.signupRequestKey || null,
      billingEmail: String(input.admin?.email || '').trim() || null,
      phone: input.phone || null,
      verificationToken,
      verificationExpiresAt,
    },
  });

  return tenant.runWithCompany(company.id, async () => {
    const user = await prisma.user.create({
      data: {
        username,
        firstName: String(admin.firstName || username).trim(),
        lastName: admin.lastName ? String(admin.lastName).trim() : null,
        email: String(admin.email).trim(),
        password: await bcrypt.hash(String(admin.password), 10),
        /* The admin is held in Pending until the email is verified. The login
           middleware already refuses Pending (accountBlockReason), so even
           knowing the password would not let them in before verification. */
        status: verifyFirst ? 'Pending' : 'superadmin',
        role: 'Admin',
        userlevel: 10,
        forcePasswordChange: admin.mustChangePassword !== false,
      },
    });
    await seedDefaults();
    const { password, totpSecret, ...safe } = user;
    return { company, admin: safe, verificationToken };
  });
}

/**
 * Verify the company and its first admin. A self-signup's trial is usable only
 * when both email verification and Cashfree mandate activation have completed.
 */
async function activatePendingCompany(companyId) {
  const now = new Date();
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error('Company not found while activating the signup.');
  const signupWaitsForPayment = Boolean(company.signupRequestKey);
  const mandateActive = Boolean(company.subscriptionActivatedAt);
  const data = {
    status: 'Active',
    verificationToken: null,
    verificationExpiresAt: null,
  };
  if (signupWaitsForPayment) {
    if (company.subscriptionStatus === 'active'
      && company.currentPeriodEnd
      && company.currentPeriodEnd > now) {
      data.subscriptionStatus = 'active';
    } else if (mandateActive) {
      data.subscriptionStatus = company.trialEndsAt && company.trialEndsAt > now ? 'trialing' : 'expired';
      data.trialStartedAt = company.subscriptionActivatedAt;
    } else {
      data.subscriptionStatus = 'pending_payment';
    }
  } else {
    data.subscriptionStatus = 'trialing';
    data.trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 86400000);
  }
  await prisma.company.update({
    where: { id: companyId },
    data,
  });
  await tenant.runWithCompany(companyId, async () => {
    const admin = await prisma.user.findFirst({
      where: { status: 'Pending' },
      orderBy: { createdAt: 'asc' },
    });
    if (admin) {
      await prisma.user.update({ where: { id: admin.id }, data: { status: 'superadmin' } });
    }
  });
}

/**
 * Delete self-signups that never confirmed their email address.
 *
 * A Pending company is one whose owner has not clicked the link in the signup
 * email. The token is good for 24 hours (`verificationExpiresAt`); once that
 * has passed the link can never fire again, so the row — and the slug, admin
 * and default lists it seeded — is dead weight a real customer might collide
 * with. Everything it owns goes through deleteCompanies, the same path the
 * platform's own delete uses, so no table is missed.
 *
 * This spans companies: a Pending one is by definition not in the Active list
 * the per-company sweeps walk, so the background job calls this once per tick
 * rather than per company. Returns how many were removed, for the log line.
 */
async function sweepExpiredSignups({ now = new Date() } = {}) {
  const expired = await tenant.runAsSystem(() => prisma.company.findMany({
    where: { status: 'Pending', verificationExpiresAt: { lt: now } },
    select: { id: true },
  }));
  if (!expired.length) return 0;
  await deleteCompanies(expired.map((company) => company.id));
  return expired.length;
}

module.exports = {
  provisionCompany,
  activatePendingCompany,
  sweepExpiredSignups,
  seedDefaults,
  newPublicKey,
  slugify,
  DEFAULT_MASTERS,
};
