const prisma = require('../prismaClient');
const tenant = require('../utils/tenant');
const storage = require('../utils/storage');
const { sendError } = require('../utils/apiError');
const { provisionCompany } = require('../utils/provisioning');

/**
 * Company self-signup and per-company branding.
 *
 *   POST /api/public/companies               start a free trial (new company + its admin)
 *   GET  /api/public/branding?company=slug   name, colour, logo for a login page
 *   GET  /api/public/branding/logo/:id       the logo image
 *   GET  /api/branding                       the signed-in company's branding
 *   PUT  /api/company/branding               { brandColor?, logoDataUrl?, removeLogo? } (admins)
 */

const HEX = /^#[0-9a-f]{6}$/i;
const LOGO_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

const brandingOf = (company) => ({
  id: company.id,
  name: company.name,
  slug: company.slug,
  brandColor: company.brandColor || null,
  logoUrl: company.logoKey ? `/api/public/branding/logo/${company.id}?v=${new Date(company.updatedAt).getTime()}` : null,
});

exports.signup = (req, res) => tenant.runAsSystem(async () => {
  try {
    if (String(process.env.ALLOW_COMPANY_SIGNUP || 'true') === 'false') {
      return res.status(403).json({ message: 'New sign-ups are closed. Contact us to get an account.' });
    }
    const b = req.body || {};
    const email = String(b.email || '').trim();
    if (!b.companyName || !b.username || !b.password || !email) {
      return res.status(400).json({ message: 'Company name, your email, a username and a password are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'That email address does not look right.' });
    const pw = String(b.password);
    if (pw.length < 10 || !/[0-9]/.test(pw) || !/[^A-Za-z0-9]/.test(pw)) {
      return res.status(400).json({ message: 'Use a password of at least 10 characters with a number and a symbol.' });
    }
    const { company } = await provisionCompany({
      name: b.companyName,
      planKey: b.planKey || 'growth',
      phone: b.phone ? String(b.phone).trim() : null,
      admin: {
        username: String(b.username).trim(),
        email,
        password: pw,
        firstName: String(b.name || b.username).trim(),
        mustChangePassword: false, // they chose it themselves just now
      },
    });
    res.status(201).json({
      message: 'Your company is ready. Signing you in…',
      company: { slug: company.slug, name: company.name, trialEndsAt: company.trialEndsAt },
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    sendError(res, error, 'Could not create your company', 500);
  }
});

exports.publicBranding = (req, res) => tenant.runAsSystem(async () => {
  const slug = String(req.query.company || '').trim().toLowerCase();
  if (!slug) return res.status(200).json(null);
  const company = await prisma.company.findUnique({ where: { slug } });
  if (!company || company.status !== 'Active') return res.status(200).json(null);
  return res.status(200).json(brandingOf(company));
});

exports.logo = (req, res) => tenant.runAsSystem(async () => {
  const company = await prisma.company.findUnique({ where: { id: String(req.params.id) } });
  if (!company?.logoKey) return res.sendStatus(404);
  const ext = company.logoKey.split('.').pop();
  const type = Object.entries(LOGO_TYPES).find(([, e]) => e === ext)?.[0];
  // SVG can carry script: served as an image with a sandboxing CSP.
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  return storage.send(res, company.logoKey, { contentType: type, maxAge: 86400 }).catch(() => res.sendStatus(500));
});

exports.current = (req, res) => tenant.runAsSystem(async () => {
  const company = await prisma.company.findUnique({ where: { id: req.companyId } });
  res.status(200).json(company ? { ...brandingOf(company), subscription: req.subscription || null } : null);
});

exports.update = (req, res) => tenant.runAsSystem(async () => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.companyId } });
    const data = {};
    if (req.body?.brandColor !== undefined) {
      const color = String(req.body.brandColor || '').trim();
      if (color && !HEX.test(color)) return res.status(400).json({ message: 'Colour must be a hex value like #4F46E5.' });
      data.brandColor = color || null;
    }
    if (req.body?.removeLogo) {
      if (company.logoKey) await storage.remove(company.logoKey);
      data.logoKey = null;
    } else if (req.body?.logoDataUrl) {
      const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(req.body.logoDataUrl));
      if (!m || !LOGO_TYPES[m[1]]) return res.status(400).json({ message: 'Use a PNG, JPG, WebP or SVG logo.' });
      const buffer = Buffer.from(m[2], 'base64');
      if (buffer.length > 1024 * 1024) return res.status(400).json({ message: 'Keep the logo under 1MB.' });
      const key = `${company.id}/branding/logo-${Date.now()}.${LOGO_TYPES[m[1]]}`;
      await storage.put(key, buffer, m[1]);
      if (company.logoKey) await storage.remove(company.logoKey);
      data.logoKey = key;
    }
    const updated = await prisma.company.update({ where: { id: company.id }, data });
    res.status(200).json(brandingOf(updated));
  } catch (error) {
    sendError(res, error, 'Could not save branding', 400);
  }
});

exports.publicPlans = (req, res) => tenant.runAsSystem(async () => {
  const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
  res.status(200).json(plans.map((p) => ({ key: p.key, name: p.name, pricePaise: p.pricePaise, maxUsers: p.maxUsers, description: p.description, features: p.features })));
});
