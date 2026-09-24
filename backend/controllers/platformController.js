const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const tenant = require('../utils/tenant');
const { provisionCompany, newPublicKey } = require('../utils/provisioning');

/**
 * The platform owner's screen: every customer company on this installation.
 *
 * Only platform admins get here — the usernames listed in PLATFORM_ADMINS.
 * A company's own super admin runs their company; the platform admin decides
 * which companies exist at all. Everything here runs across companies
 * (tenant.runAsSystem), which is exactly why the gate is so narrow.
 *
 *   GET  /api/platform/companies            with users / leads / bookings counts
 *   POST /api/platform/companies            { name, slug?, plan?, admin: {...} }
 *   PUT  /api/platform/companies/:id        { name?, status?, plan? }
 *   POST /api/platform/companies/:id/rotate-key
 *
 * And for any company's own administrators:
 *   GET  /api/company                       name, slug, public key, lead form URLs
 *   POST /api/company/rotate-key
 */

const platformAdmins = () => String(process.env.PLATFORM_ADMINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const isPlatformAdmin = (user) => Boolean(user) && platformAdmins().includes(user.username);

function requirePlatformAdmin(req, res, next) {
  if (!isPlatformAdmin(req.user)) {
    return res.status(403).json({ message: 'Only the platform administrator can manage companies.' });
  }
  return next();
}

exports.requirePlatformAdmin = requirePlatformAdmin;
exports.isPlatformAdmin = isPlatformAdmin;

exports.listCompanies = (req, res) => tenant.runAsSystem(async () => {
  try {
    const companies = await prisma.company.findMany({ orderBy: { createdAt: 'asc' } });
    const [users, leads, bookings] = await Promise.all([
      prisma.user.groupBy({ by: ['companyId'], _count: { id: true } }),
      prisma.lead.groupBy({ by: ['companyId'], _count: { id: true } }),
      prisma.booking.groupBy({ by: ['companyId'], _count: { id: true } }),
    ]);
    const count = (rows, id) => rows.find((r) => r.companyId === id)?._count.id || 0;
    res.status(200).json(companies.map((c) => ({
      ...c,
      users: count(users, c.id),
      leads: count(leads, c.id),
      bookings: count(bookings, c.id),
    })));
  } catch (error) {
    sendError(res, error, 'Could not load companies', 500);
  }
});

exports.createCompany = (req, res) => tenant.runAsSystem(async () => {
  try {
    const { company, admin } = await provisionCompany(req.body || {});
    res.status(201).json({ company, admin });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    sendError(res, error, 'Could not create the company', 400);
  }
});

exports.updateCompany = (req, res) => tenant.runAsSystem(async () => {
  try {
    const data = {};
    if (req.body?.name) data.name = String(req.body.name).trim();
    if (req.body?.plan !== undefined) data.plan = req.body.plan || null;
    if (req.body?.status) {
      if (!['Active', 'Suspended'].includes(req.body.status)) return res.status(400).json({ message: 'Status must be Active or Suspended.' });
      // The platform's own company cannot be suspended from inside it.
      if (req.params.id === req.companyId && req.body.status === 'Suspended') {
        return res.status(400).json({ message: 'You cannot suspend the company you are signed in to.' });
      }
      data.status = req.body.status;
    }
    const company = await prisma.company.update({ where: { id: req.params.id }, data });
    res.status(200).json(company);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Company not found' });
    sendError(res, error, 'Could not update the company', 400);
  }
});

exports.rotateCompanyKey = (req, res) => tenant.runAsSystem(async () => {
  try {
    const company = await prisma.company.update({ where: { id: req.params.id }, data: { publicKey: newPublicKey() } });
    res.status(200).json(company);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Company not found' });
    sendError(res, error, 'Could not rotate the key', 400);
  }
});

/** The signed-in user's own company, with what its admin needs for integrations. */
exports.myCompany = async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.companyId } });
    if (!company) return res.status(404).json({ message: 'Company not found' });
    const base = String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    res.status(200).json({
      id: company.id,
      name: company.name,
      slug: company.slug,
      status: company.status,
      plan: company.plan,
      publicKey: company.publicKey,
      isPlatformAdmin: isPlatformAdmin(req.user),
      endpoints: {
        websiteLeads: `${base}/api/public/leads`,
        campaignLeads: `${base}/api/public/campaign-leads?key=${company.publicKey}&name=&mobile=`,
        signup: `${base}/?company=${company.slug}`,
        googleLeadFormWebhook: `${base}/api/webhooks/google-leads/<integration key>`,
        metaWebhook: `${base}/api/webhooks/meta`,
        exotelStatusCallback: `${base}/api/webhooks/exotel/<call id>`,
      },
    });
  } catch (error) {
    sendError(res, error, 'Could not load the company', 500);
  }
};

exports.rotateMyKey = async (req, res) => {
  try {
    const company = await prisma.company.update({ where: { id: req.companyId }, data: { publicKey: newPublicKey() } });
    res.status(200).json({ publicKey: company.publicKey });
  } catch (error) {
    sendError(res, error, 'Could not rotate the key', 400);
  }
};
