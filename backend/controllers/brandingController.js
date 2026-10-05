const prisma = require('../prismaClient');
const crypto = require('crypto');
const tenant = require('../utils/tenant');
const storage = require('../utils/storage');
const { sendError } = require('../utils/apiError');
const { provisionCompany, activatePendingCompany } = require('../utils/provisioning');
const billing = require('../utils/billing');
const { normalizeDomain, platformUrl, companyByHost } = require('../utils/companyUrl');
const { sendMail } = require('../utils/mailer');

/**
 * Company self-signup and per-company branding.
 *
 *   POST /api/public/companies               create company/admin and initialize Cashfree trial billing
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
  logoUrl:     assetUrl(company, 'logo',      company.logoKey),
  /* Falls back on the client side with `logoDarkUrl || logoUrl` so a tenant
     with only one logo still gets something readable in the other theme. */
  logoDarkUrl: assetUrl(company, 'logo-dark', company.logoDarkKey),
  iconUrl:     assetUrl(company, 'icon',      company.iconKey),
  faviconUrl:  assetUrl(company, 'favicon',   company.faviconKey),
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
    const phone = String(b.phone || '').replace(/\D/g, '');
    if (phone.length < 10) return res.status(400).json({ message: 'Enter a valid 10-digit phone number to set up recurring payment authorization.' });
    const pw = String(b.password);
    if (pw.length < 10 || !/[0-9]/.test(pw) || !/[^A-Za-z0-9]/.test(pw)) {
      return res.status(400).json({ message: 'Use a password of at least 10 characters with a number and a symbol.' });
    }
    /* Verify-first is the default self-signup mode: the account exists but
       cannot sign in until the emailed link is clicked. Opting out via the
       env flag is for the test suite, which creates throwaway companies and
       cannot click an email in the browser. */
    const verifyFirst = String(process.env.SKIP_SIGNUP_VERIFICATION || '').toLowerCase() !== 'true';
    const planKey = String(b.planKey || 'growth').trim();
    const plan = await prisma.plan.findUnique({ where: { key: planKey } });
    if (!plan || !plan.active) return res.status(400).json({ message: 'Choose one of the plans currently available.' });
    const signupRequestKey = String(b.signupRequestKey || '').trim();
    if (signupRequestKey && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(signupRequestKey)) {
      return res.status(400).json({ message: 'Signup request is invalid. Refresh the page and try again.' });
    }

    if (signupRequestKey) {
      const existing = await prisma.company.findUnique({ where: { signupRequestKey } });
      if (existing) {
        const existingAdmin = await tenant.runWithCompany(existing.id, () =>
          prisma.user.findFirst({ where: { username: String(b.username).trim() }, select: { email: true } }));
        if (existing.name !== String(b.companyName).trim()
          || String(existing.billingEmail || '').toLowerCase() !== email.toLowerCase()
          || !existingAdmin
          || String(existingAdmin.email || '').toLowerCase() !== email.toLowerCase()
          || existing.planKey !== planKey) {
          return res.status(409).json({ message: 'This signup request was already used for different company details.' });
        }
        const result = await signupPayment(existing, plan, email);
        return res.status(result.paymentError ? 503 : 200).json({
          message: result.paymentError || 'Your signup is already in progress.',
          accountCreated: true,
          pending: existing.status === 'Pending',
          email,
          checkout: result.checkout,
          paymentError: result.paymentError,
          company: { slug: existing.slug, name: existing.name },
        });
      }
    }

    const trialEndsAt = new Date(Date.now() + billing.TRIAL_DAYS * 86400000);
    const { company, verificationToken } = await provisionCompany({
      name: b.companyName,
      planKey,
      phone: phone.slice(-10),
      verifyBeforeActivate: verifyFirst,
      subscriptionStatus: 'pending_payment',
      trialEndsAt,
      signupRequestKey: signupRequestKey || null,
      admin: {
        username: String(b.username).trim(),
        email,
        password: pw,
        firstName: String(b.name || b.username).trim(),
        mustChangePassword: false, // they chose it themselves just now
      },
    });
    const result = await signupPayment(company, plan, email);

    /* Tell the platform admins somebody started a trial — a quiet "ping"
       so they can watch signups land, follow up, and spot abuse without
       having to refresh the Companies screen. Non-blocking: a mail failure
       must not block the signup response. */
    notifyPlatformAdminsOfSignup({ req, company, email, planKey })
      .catch((err) => console.log('[signup] platform admin notification failed:', err.message));

    if (verifyFirst && verificationToken) {
      const { link, sent } = await sendVerificationEmail({ req, email, company, verificationToken });
      /* In production the link must never leave the backend — only the
         inbox owner should have it. In dev, if the mailer wasn't configured
         and nothing was sent, hand the link back so the developer can click
         it from the browser's response panel. */
      const devLink = (!sent && process.env.NODE_ENV !== 'production') ? link : undefined;
      return res.status(201).json({
        message: sent
          ? `Check your email to verify your company. Complete Cashfree payment authorization to start your trial.`
          : `Account created. Mail is not configured on this server — ask an administrator for the verification link, or configure SMTP in Mail Settings.`,
        pending: true,
        email,
        checkout: result.checkout,
        paymentError: result.paymentError,
        company: { slug: company.slug, name: company.name },
        ...(devLink ? { _devVerifyLink: devLink } : {}),
      });
    }

    res.status(201).json({
      message: result.paymentError || 'Payment authorization is required to start your trial.',
      checkout: result.checkout,
      paymentError: result.paymentError,
      company: { slug: company.slug, name: company.name, trialEndsAt: company.trialEndsAt },
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    sendError(res, error, 'Could not create your company', 500);
  }
});

async function signupPayment(company, plan, email) {
  try {
    const checkout = await billing.createSubscription(company, plan, email, { startTrial: true });
    return { checkout, paymentError: null };
  } catch (error) {
    const safeMessage = error.status
      ? error.message
      : 'Cashfree could not initialize subscription authorization. Sign in after email verification to retry from Billing & Plan.';
    console.error('[signup] Cashfree subscription initialization failed', JSON.stringify({
      companyId: company.id,
      status: error.status || null,
      code: error.code || null,
    }));
    return { checkout: null, paymentError: safeMessage };
  }
}

/* ---- platform-admin signup notification --------------------------------- */

/**
 * Email the people listed in PLATFORM_ADMINS when a new company signs up for
 * a trial.
 *
 * The list is read from the env rather than from a role column so that a
 * client company's admin can never make themselves a platform admin by
 * editing their own row. The recipient address is each listed user's own
 * email, which lives on the User row.
 *
 * Deliberately quiet when nothing is configured: a platform without
 * PLATFORM_ADMINS set is one person running everything themselves, and the
 * Companies screen is enough. The failure path logs rather than throws, so
 * a mis-configured notifier never blocks a legitimate signup.
 */
async function notifyPlatformAdminsOfSignup({ req, company, email, planKey }) {
  const names = String(process.env.PLATFORM_ADMINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (!names.length) return;

  const admins = await tenant.runWithCompany(tenant.DEFAULT_COMPANY_ID, () =>
    prisma.user.findMany({
      where: { username: { in: names }, email: { not: null } },
      select: { username: true, email: true },
    }));
  if (!admins.length) return;

  const base = appBaseUrl(req);
  const safe = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const companiesUrl = `${base}/platform/companies`;
  const subject = `New ${planKey} trial: ${company.name}`;
  const text =
`A new company has signed up for a free trial.

  Company:  ${company.name}
  Email:    ${email}
  Plan:     ${planKey}
  Status:   ${company.status} (${company.status === 'Pending' ? 'awaiting email verification' : 'active'})

See it on the Companies screen:
${companiesUrl}

(This is an automated notification from NexorCRM.)`;
  const html = `
<!doctype html><html><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f5f6fa;padding:24px;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 2px rgba(0,0,0,.04)">
    <h2 style="margin:0 0 12px 0">New trial signup</h2>
    <table style="border-collapse:collapse;margin:12px 0 20px 0">
      <tr><td style="padding:6px 12px 6px 0;color:#64748b">Company</td><td style="padding:6px 0"><strong>${safe(company.name)}</strong></td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#64748b">Email</td><td style="padding:6px 0">${safe(email)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#64748b">Plan</td><td style="padding:6px 0">${safe(planKey)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#64748b">Status</td><td style="padding:6px 0">${safe(company.status)}</td></tr>
    </table>
    <p style="margin:16px 0">
      <a href="${safe(companiesUrl)}" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Open Companies</a>
    </p>
  </div>
</body></html>`;

  for (const admin of admins) {
    const result = await sendMail({
      to: admin.email,
      subject,
      text,
      html,
    }, { companyId: tenant.DEFAULT_COMPANY_ID })
      .catch((e) => ({ status: 'skipped', error: e.message }));
    if (result?.status !== 'sent') {
      console.log(`[signup] admin notification to ${admin.username} <${admin.email}> not sent (${result?.error || 'unknown'})`);
    }
  }
}

/* ---- verification handshake --------------------------------------------- */

/** Where emailed links point. APP_URL in production, falls back to the request
 *  origin in dev so the local login page is reachable without extra config. */
function appBaseUrl(req) {
  const configured = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  return `${req.protocol}://${req.get('host')}`;
}

/** The HTML/text used in the verification email. Kept inline rather than in
 *  the EmailTemplate table because this fires BEFORE a company (and its
 *  per-tenant templates) exists. The link's token is single-use. */
function verificationEmailBody({ link, companyName, hours }) {
  const safe = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const name = safe(companyName);
  const text =
`Welcome to NexorCRM.

Confirm your email to activate ${companyName}. Your trial begins after Cashfree confirms the recurring-payment mandate:

${link}

This link expires in ${hours} hours. If you did not create an account, ignore this email.`;
  const html = `
<!doctype html><html><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f5f6fa;padding:24px;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 2px rgba(0,0,0,.04)">
    <h2 style="margin:0 0 8px 0">Welcome to NexorCRM</h2>
    <p>Confirm your email to activate <strong>${name}</strong>. Your trial begins after Cashfree confirms the recurring-payment mandate.</p>
    <p style="margin:24px 0">
      <a href="${safe(link)}" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Verify my email</a>
    </p>
    <p style="color:#64748b;font-size:14px">Or paste this address into your browser:<br>
      <span style="word-break:break-all">${safe(link)}</span></p>
    <p style="color:#64748b;font-size:14px">This link expires in ${hours} hours. If you did not create an account, you can ignore this email.</p>
  </div>
</body></html>`;
  return { text, html };
}

/** Build the link, dispatch the email, and return the link alongside the
 *  mail-send result. Non-blocking at the controller level: if SMTP is not
 *  configured, we return the link so the controller can decide what to do —
 *  log it in production, surface it in the response in dev. */
async function sendVerificationEmail({ req, email, company, verificationToken }) {
  const base = appBaseUrl(req);
  const link = `${base}/verify-company?token=${verificationToken}`;
  const { text, html } = verificationEmailBody({ link, companyName: company.name, hours: 24 });
  const result = await sendMail({
    to: email,
    subject: `Verify your email to activate ${company.name}`,
    text,
    html,
  }, { companyId: tenant.DEFAULT_COMPANY_ID }).catch((e) => ({ status: 'skipped', error: e.message }));
  if (result?.status !== 'sent') {
    // Visible both ways: a prominent log line AND the link in the string so
    // a tail -f on the backend picks it up without scrolling.
    console.log('\n' + '='.repeat(72));
    console.log(`[signup] verification email NOT SENT (${result?.error || 'unknown reason'})`);
    console.log(`[signup] to: ${email}`);
    console.log(`[signup] link: ${link}`);
    console.log('='.repeat(72) + '\n');
  }
  return { link, sent: result?.status === 'sent' };
}

/* GET /api/public/verify-company?token=xxx
 *
 * Flips a Pending company and its first admin to Active, starts the trial
 * clock, and clears the token. One-shot: a used token no longer matches, so
 * refreshing the success page cannot re-trigger activation. */
exports.verifyCompany = (req, res) => tenant.runAsSystem(async () => {
  try {
    const token = String(req.query.token || '').trim();
    if (!token || token.length < 32) {
      return res.status(400).json({ message: 'That verification link is not valid.' });
    }
    const company = await prisma.company.findUnique({ where: { verificationToken: token } });
    if (!company) {
      return res.status(404).json({ message: 'This link has already been used or is not recognised.' });
    }
    if (!company.verificationExpiresAt || company.verificationExpiresAt < new Date()) {
      return res.status(410).json({ message: 'This verification link has expired. Please request a new one.' });
    }
    await activatePendingCompany(company.id);
    res.status(200).json({
      message: 'Verified! You can sign in now.',
      slug: company.slug,
      companyName: company.name,
    });
  } catch (error) {
    sendError(res, error, 'Could not verify your account', 500);
  }
});

/* POST /api/public/resend-verification { email }
 *
 * Issues a fresh token and sends a new email for a Pending company. Finds the
 * company by its admin's email so the caller does not need the token (which
 * is the exact thing they lost). Rate-limited at the route to one request
 * per minute per IP so this is not a spam vector. */
exports.resendVerification = (req, res) => tenant.runAsSystem(async () => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email is required.' });
    /* Find the Pending admin by email, then the company. runAsSystem is OK
       here because we are not reading sensitive tenant data — just checking
       whether this address has a pending signup to re-notify. */
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, status: 'Pending' },
      orderBy: { createdAt: 'desc' },
    });
    /* Always answer the same message, whether we matched or not, so this
       cannot be used to probe for registered addresses. */
    const generic = 'If that email has a pending account, we sent a new verification link.';
    if (!user) return res.status(200).json({ message: generic });
    const company = await prisma.company.findUnique({ where: { id: user.companyId } });
    if (!company || company.status !== 'Pending') return res.status(200).json({ message: generic });
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const updated = await prisma.company.update({
      where: { id: company.id },
      data: { verificationToken, verificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });
    await sendVerificationEmail({ req, email: user.email, company: updated, verificationToken });
    res.status(200).json({ message: generic });
  } catch (error) {
    sendError(res, error, 'Could not resend the verification email', 500);
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

exports.logo     = serveAsset('logo',      'logoKey',      LOGO_TYPES);
exports.logoDark = serveAsset('logo-dark', 'logoDarkKey',  LOGO_TYPES);
exports.icon     = serveAsset('icon',      'iconKey',      LOGO_TYPES);
exports.favicon  = serveAsset('favicon',   'faviconKey',   FAVICON_TYPES);

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
      { kind: 'logo',     column: 'logoKey',     types: LOGO_TYPES,    maxBytes: 1024 * 1024, badType: 'Use a PNG, JPG, WebP or SVG logo.',    tooBig: 'Keep the logo under 1MB.' },
      { kind: 'logoDark', column: 'logoDarkKey', types: LOGO_TYPES,    maxBytes: 1024 * 1024, badType: 'Use a PNG, JPG, WebP or SVG logo.',    tooBig: 'Keep the logo under 1MB.' },
      { kind: 'icon',     column: 'iconKey',     types: LOGO_TYPES,    maxBytes:  512 * 1024, badType: 'Use a PNG, JPG, WebP or SVG icon.',    tooBig: 'Keep the icon under 512KB.' },
      { kind: 'favicon',  column: 'faviconKey',  types: FAVICON_TYPES, maxBytes:  256 * 1024, badType: 'Use a PNG, ICO, JPG or SVG favicon.', tooBig: 'Keep the favicon under 256KB.' },
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
