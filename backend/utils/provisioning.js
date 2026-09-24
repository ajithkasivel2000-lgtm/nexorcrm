const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../prismaClient');
const tenant = require('./tenant');
const { isUsernameTaken } = require('./companyAdmin');

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

  const company = await prisma.company.create({
    data: { name, slug, plan: input.plan || null, status: 'Active', publicKey: newPublicKey() },
  });

  return tenant.runWithCompany(company.id, async () => {
    const user = await prisma.user.create({
      data: {
        username,
        firstName: String(admin.firstName || username).trim(),
        lastName: admin.lastName ? String(admin.lastName).trim() : null,
        email: String(admin.email).trim(),
        password: await bcrypt.hash(String(admin.password), 10),
        status: 'superadmin',
        role: 'Admin',
        userlevel: 10,
        forcePasswordChange: true,
      },
    });
    await seedDefaults();
    const { password, totpSecret, ...safe } = user;
    return { company, admin: safe };
  });
}

module.exports = { provisionCompany, seedDefaults, newPublicKey, slugify, DEFAULT_MASTERS };
