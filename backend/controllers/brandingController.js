const prisma = require('../prismaClient');
const tenant = require('../utils/tenant');
const storage = require('../utils/storage');
const { sendError } = require('../utils/apiError');
const { provisionCompany } = require('../utils/provisioning');
const { normalizeDomain, platformUrl, companyByHost } = require('../utils/companyUrl');

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
/* Favicons: ICO alongside the PNG/JPG/SVG set logos accept. Browsers still
   ask for /favicon.ico, so we must store and serve the format if given one. */
const FAVICON_TYPES = { ...LOGO_TYPES, 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico' };

const assetUrl = (company, kind, key) =>
  key ? `/api/public/branding/${kind}/${company.id}?v=${new Date(company.updatedAt).getTime()}` : null;

const brandingOf = (company) => ({
  id: company.id,
  name: company.name,
  slug: company.slug,
  brandColor:   company.brandColor   || null,
  sidebarColor: company.sidebarColor || null,
  logoUrl:    assetUrl(company, 'logo',    company.logoKey),
  iconUrl:    assetUrl(company, 'icon',    company.iconKey),
  faviconUrl: assetUrl(company, 'favicon', company.faviconKey),
  loginContent: company.loginContent || null,
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

/* A company is named by ?company=slug, or, on its own domain
   (crm.roofonwalls.com), by the address the page was opened on. */
exports.publicBranding = (req, res) => tenant.runAsSystem(async () => {
  const slug = String(req.query.company || '').trim().toLowerCase();
  const company = slug
    ? await prisma.company.findUnique({ where: { slug } })
    : await companyByHost(req.hostname);
  if (!company || company.status !== 'Active') return res.status(200).json(null);
  return res.status(200).json(brandingOf(company));
});

/* Caddy on-demand TLS gate.
 *
 * Caddy calls this before fetching a Let's Encrypt cert for an unknown Host,
 * so a stranger pointing their domain at our IP cannot make us issue certs
 * for domains we do not serve (rate-limit abuse and SNI reconnaissance).
 *
 * The ?domain=<host> query is what Caddy sends. We say yes to the platform's
 * own hostnames and to any Active company's customDomain; everyone else gets
 * 404, which Caddy treats as "refuse to issue". */
exports.allowHost = (req, res) => tenant.runAsSystem(async () => {
  const raw = String(req.query.domain || '').trim().toLowerCase();
  if (!raw) return res.sendStatus(400);
  const host = normalizeDomain(raw);
  if (!host) return res.sendStatus(404);
  try {
    const platform = new URL(platformUrl()).hostname;
    if (host === platform) return res.sendStatus(200);
  } catch { /* platformUrl may be unset in dev — fall through to DB check */ }
  const company = await prisma.company.findUnique({ where: { customDomain: host }, select: { status: true } });
  if (company && company.status === 'Active') return res.sendStatus(200);
  return res.sendStatus(404);
});

/* One handler for logo, icon and favicon. The field name on Company is
   `${kind}Key`; the request chooses the kind by which route called us. */
function serveAsset(kind, keyField, typeMap) {
  return (req, res) => tenant.runAsSystem(async () => {
    const company = await prisma.company.findUnique({ where: { id: String(req.params.id) } });
    const key = company?.[keyField];
    if (!key) return res.sendStatus(404);
    const ext = key.split('.').pop();
    const type = Object.entries(typeMap).find(([, e]) => e === ext)?.[0];
    // SVG can carry script: served as an image with a sandboxing CSP.
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    return storage.send(res, key, { contentType: type, maxAge: 86400 }).catch(() => res.sendStatus(500));
  });
}

exports.logo    = serveAsset('logo',    'logoKey',    LOGO_TYPES);
exports.icon    = serveAsset('icon',    'iconKey',    LOGO_TYPES);
exports.favicon = serveAsset('favicon', 'faviconKey', FAVICON_TYPES);

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
    if (req.body?.sidebarColor !== undefined) {
      const color = String(req.body.sidebarColor || '').trim();
      if (color && !HEX.test(color)) return res.status(400).json({ message: 'Sidebar colour must be a hex value like #111827.' });
      data.sidebarColor = color || null;
    }
    if (req.body?.loginContent !== undefined) {
      const value = req.body.loginContent;
      if (value === null) {
        data.loginContent = null;
      } else if (value && typeof value === 'object') {
        const clean = {};
        for (const key of ['heading', 'tagline', 'welcomeTitle']) {
          const raw = String(value[key] ?? '').trim();
          if (raw) clean[key] = raw.slice(0, 200);
        }
        data.loginContent = Object.keys(clean).length ? clean : null;
      } else {
        return res.status(400).json({ message: 'loginContent must be an object or null.' });
      }
    }
    /* Three uploads with the same shape: logo (wide), icon (square for narrow
       slots), favicon (browser tab). Each has its own column, its own type map
       (favicon also accepts ICO), and its own max size. The logo rule is kept
       identical to what the UI used before this refactor, so an admin saving
       just a logo sees no behaviour change. */
    const UPLOADS = [
      { kind: 'logo',    column: 'logoKey',    types: LOGO_TYPES,    maxBytes: 1024 * 1024, badType: 'Use a PNG, JPG, WebP or SVG logo.',    tooBig: 'Keep the logo under 1MB.' },
      { kind: 'icon',    column: 'iconKey',    types: LOGO_TYPES,    maxBytes:  512 * 1024, badType: 'Use a PNG, JPG, WebP or SVG icon.',    tooBig: 'Keep the icon under 512KB.' },
      { kind: 'favicon', column: 'faviconKey', types: FAVICON_TYPES, maxBytes:  256 * 1024, badType: 'Use a PNG, ICO, JPG or SVG favicon.', tooBig: 'Keep the favicon under 256KB.' },
    ];
    for (const u of UPLOADS) {
      const removeFlag = `remove${u.kind.charAt(0).toUpperCase()}${u.kind.slice(1)}`;
      const dataField  = `${u.kind}DataUrl`;
      if (req.body?.[removeFlag]) {
        if (company[u.column]) await storage.remove(company[u.column]);
        data[u.column] = null;
      } else if (req.body?.[dataField]) {
        const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(req.body[dataField]));
        if (!m || !u.types[m[1]]) return res.status(400).json({ message: u.badType });
        const buffer = Buffer.from(m[2], 'base64');
        if (buffer.length > u.maxBytes) return res.status(400).json({ message: u.tooBig });
        const key = `${company.id}/branding/${u.kind}-${Date.now()}.${u.types[m[1]]}`;
        await storage.put(key, buffer, m[1]);
        if (company[u.column]) await storage.remove(company[u.column]);
        data[u.column] = key;
      }
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
