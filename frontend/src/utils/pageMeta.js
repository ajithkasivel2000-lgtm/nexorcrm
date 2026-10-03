/**
 * Per-page title, description and keywords, keyed by route.
 *
 * A single-page app only ever ships one index.html, so without this every
 * screen shows the same tab title. Ten tabs open on the CRM were ten tabs
 * reading "NexorCRM | Smart CRM & Business Management Platform".
 *
 * What each field is actually worth here:
 *
 *   title        — the real win. It names the browser tab, the bookmark, and
 *                  the history entry. This is what makes ten open tabs legible.
 *   description  — used by link unfurlers (Slack, Teams, WhatsApp) when someone
 *                  pastes an internal URL, and by the browser's own UI.
 *   keywords     — Google has ignored this tag since 2009. Kept because some
 *                  smaller engines and internal search appliances still read
 *                  it, and it costs nothing; do not expect ranking from it.
 *
 * Search engines cannot reach most of these pages at all — they sit behind a
 * login — so `robots` is set to noindex for everything except the signed-out
 * landing view. See applyPageMeta().
 */

const DEFAULT_BRAND = 'NexorCRM';
/* The platform's name until a tenant brand overrides it. Set by
   applyBranding() when the branding API returns a company name. */
let activeBrand = DEFAULT_BRAND;
let activeFaviconUrl = null;
const brandName = () => activeBrand;
const titleSuffix = () => ` | ${activeBrand}`;

/** The share image, used when a page does not name one of its own. */
const SITE_IMAGE = '/og-image.png';
const LOCALE = 'en_US';

/**
 * The address bar / task-switcher tint, per theme.
 * Matches --nx-bg-app in ui/tokens.css so the browser chrome does not clash
 * with the app when dark mode is on.
 */
const THEME_COLOR = { light: '#f5f6fa', dark: '#0b1120' };

/** Words every page shares, so each entry only lists what is specific to it.
 *
 * Deliberately tenant-agnostic: the platform runs for companies in any
 * industry, so "real estate CRM" used to live here but no longer does — a
 * company selling SaaS does not want its tab titles pitching real estate. */
const BASE_KEYWORDS = ['CRM software', 'lead management', 'customer management'];

/**
 * Routes are matched longest-first, and `:param` matches one path segment, so
 * `/leads/:id` wins over `/leads` for `/leads/LED-2026-001`.
 */
export const PAGE_META = {
  '/': {
    title: 'Dashboard',
    description: 'Your whole pipeline at a glance — leads, opportunities, projects, follow-ups and recent activity across the CRM.',
    keywords: ['CRM dashboard', 'sales dashboard', 'pipeline overview', 'sales analytics'],
  },

  /* ---- Leads ----------------------------------------------------------- */
  '/leads': {
    title: 'Leads',
    description: 'Every lead in one table — filter by status, source, owner and project, and act on them without leaving the list.',
    keywords: ['lead list', 'lead management', 'lead tracking', 'sales leads'],
  },
  '/leads/:id': {
    title: 'Lead Profile',
    description: 'The full record for one lead: contact details, source, status, site visits, follow-ups and the complete activity log.',
    keywords: ['lead profile', 'lead details', 'lead record', 'lead activity log'],
  },
  '/import-leads': {
    title: 'Import Leads',
    description: 'Bring leads in from a CSV file, map the columns and assign an owner in one pass.',
    keywords: ['import leads', 'CSV import', 'bulk lead upload'],
  },
  '/duplicate-leads': { title: 'Duplicate Leads', description: 'Leads that share a mobile number or email with another record.', keywords: ['duplicate leads', 'lead deduplication'] },
  '/rejected-leads': { title: 'Rejected Leads', description: 'Enquiries marked rejected, with the reason recorded against each one.', keywords: ['rejected leads', 'lost enquiries'] },
  '/site-visits': { title: 'Site Visits', description: 'Site visits scheduled, confirmed and completed across every project.', keywords: ['site visits', 'property viewings', 'visit scheduling'] },
  '/follow-up-leads': { title: 'Follow-ups', description: 'Leads with a follow-up due — overdue, today and the week ahead.', keywords: ['follow ups', 'lead follow up', 'sales reminders'] },

  /* ---- Opportunities and customers ------------------------------------- */
  '/opportunities': {
    title: 'Opportunities',
    description: 'Deals in progress, by stage — from site visit converted through negotiation to booking.',
    keywords: ['sales opportunities', 'deal pipeline', 'sales stages'],
  },
  '/opportunities/:id': {
    title: 'Opportunity',
    description: 'One opportunity in full: contact, unit, booking details, commission and its activity log.',
    keywords: ['opportunity details', 'deal record', 'booking details'],
  },
  '/customers': { title: 'Customers', description: 'Every customer on the books, with their projects and contact details.', keywords: ['customer list', 'customer management', 'client records'] },
  '/campaign-leads': { title: 'Campaign Leads', description: 'Leads that arrived from a marketing campaign, grouped by the campaign that produced them.', keywords: ['campaign leads', 'marketing campaigns', 'lead source tracking'] },
  '/rrq': { title: 'RRQ', description: 'The routing queues leads flow through — who gets the next Presales enquiry on this project, who gets the next Sales handover.', keywords: ['RRQ', 'routing queues', 'lead routing', 'round robin'] },
  '/report': { title: 'Export Report', description: 'Export leads for a date range, with the status, source and owner filters applied.', keywords: ['export leads', 'lead export', 'CRM reports'] },

  /* ---- Channel partners ------------------------------------------------ */
  '/channel-partners': { title: 'Channel Partners', description: 'Every registered channel partner, with their documents, bank details and the leads they brought in.', keywords: ['channel partners', 'broker management', 'partner network'] },
  '/channel-partners/create': { title: 'New Channel Partner', description: 'Register a channel partner: company details, documents and account information.', keywords: ['add channel partner', 'partner registration', 'broker onboarding'] },
  '/channel-partners/edit/:id': { title: 'Edit Channel Partner', description: 'Update a channel partner’s details, documents and bank account.', keywords: ['edit channel partner', 'partner details'] },

  /* ---- Projects -------------------------------------------------------- */
  '/projects/list': { title: 'Projects', description: 'Every project in the portfolio, with status, type, amenities and contact details.', keywords: ['project list', 'project portfolio', 'project management'] },
  '/projects/edit/:id': { title: 'Edit Project', description: 'Update a project’s details, amenities, features and contact information.', keywords: ['edit project', 'project details'] },
  '/projects/status': { title: 'Project Status', description: 'Manage the statuses a project can move through.', keywords: ['project status', 'project stages'] },
  '/projects/type': { title: 'Project Type', description: 'Manage the project types used across the CRM.', keywords: ['project types', 'project categories'] },

  /* ---- Lead source master ---------------------------------------------- */
  '/lead-source/primary': { title: 'Primary Sources', description: 'The primary lead sources leads can be attributed to.', keywords: ['lead sources', 'primary source', 'attribution'] },
  '/lead-source/secondary': { title: 'Secondary Sources', description: 'Secondary lead sources, for finer attribution under a primary source.', keywords: ['secondary source', 'lead attribution'] },
  '/lead-source/tertiary': { title: 'Tertiary Sources', description: 'Tertiary lead sources, the most specific level of attribution.', keywords: ['tertiary source', 'lead attribution'] },
  '/lead-source/status': { title: 'Lead Statuses', description: 'The statuses a lead can move through, from new to closed.', keywords: ['lead status', 'lead stages', 'pipeline stages'] },
  '/lead-source/type': { title: 'Lead Types', description: 'The lead types used to classify incoming enquiries.', keywords: ['lead types', 'lead classification'] },

  /* ---- Settings -------------------------------------------------------- */
  '/settings/user-admin': { title: 'User Admin', description: 'Manage user accounts, roles, group membership and access.', keywords: ['user management', 'user admin', 'account administration'] },
  '/settings/user-admin/edit/:id': { title: 'Edit User', description: 'Review and update a user’s profile, roles, permissions, sessions and account status.', keywords: ['edit user', 'user profile', 'user permissions'] },
  '/settings/user-groups': { title: 'User Groups', description: 'Group users together and manage membership in one place.', keywords: ['user groups', 'team management'] },
  '/settings/registration': { title: 'Registration Settings', description: 'Control how new accounts are created, activated and validated.', keywords: ['registration settings', 'account activation', 'signup rules'] },
  '/settings/session': { title: 'Session Settings', description: 'Set inactivity timeouts, cookie expiry and remember-me behaviour.', keywords: ['session settings', 'session timeout', 'cookie settings'] },
  '/settings/lead-assignment': { title: 'Lead Assignment', description: 'Set how long an assigned user has to respond before a lead moves to the next person on the project round-robin.', keywords: ['lead assignment', 'auto reassignment', 'follow-up timeout', 'round robin'] },
  '/settings/user': { title: 'User Settings', description: 'Global settings for user accounts and individual home pages.', keywords: ['user settings', 'account settings'] },
  '/settings/security': { title: 'Security Settings', description: 'Disallow usernames and ban IP addresses from registering or signing in.', keywords: ['security settings', 'IP blocking', 'access control'] },
  '/settings/logs': { title: 'Logs', description: 'The audit trail — who did what, when, and from where.', keywords: ['audit log', 'activity log', 'system logs'] },
  '/settings/mail': { title: 'Email Settings', description: 'Configure the SMTP server used to send notifications, and test it.', keywords: ['email settings', 'SMTP configuration', 'mail server'] },
  '/settings/email-templates': { title: 'Email Templates', description: 'The templates behind every automated email the CRM sends.', keywords: ['email templates', 'notification templates'] },
  '/settings/reminders': { title: 'Reminders', description: 'When and how the CRM reminds owners about their open leads, site visits and follow-ups.', keywords: ['reminders', 'notification schedule', 'follow-up reminders'] },
  '/settings/integrations': { title: 'Integrations', description: 'Branding, company key, lead-form URLs, WhatsApp, calling, Facebook/Google lead sources, scheduled reports and the email log.', keywords: ['integrations', 'branding', 'WhatsApp', 'webhooks', 'company key'] },
  '/settings/login-layout': { title: 'Login Layout', description: 'The heading, tagline and welcome title shown on your company sign-in page.', keywords: ['login layout', 'sign-in page', 'branding'] },
  '/settings/billing': { title: 'Billing & Plan', description: 'Your subscription, plan, next renewal and payment history.', keywords: ['billing', 'subscription', 'plan', 'payments'] },

  /* ---- Communication and bookings -------------------------------------- */
  '/team-chat': { title: 'Team Chat', description: 'Chat with the rest of the team in rooms you choose.', keywords: ['team chat', 'messaging', 'collaboration'] },
  '/assistant': { title: 'Assistant', description: 'Ask the CRM about leads, projects, bookings and more in natural language.', keywords: ['AI assistant', 'natural language search', 'help'] },
  '/bookings': { title: 'Bookings & Payments', description: 'Every booking on the books, its payment schedule and the receipts raised against it.', keywords: ['bookings', 'payments', 'receipts', 'collections'] },
  '/report-builder': { title: 'Report Builder', description: 'Build a custom report by picking the entity, columns and filters, then export it.', keywords: ['report builder', 'custom reports', 'export'] },

  /* ---- Platform (platform admins only) --------------------------------- */
  '/platform/companies': { title: 'Companies', description: 'Every company on the platform — subscription state, admins, domains and plans.', keywords: ['platform admin', 'companies', 'tenants', 'multi-tenant'] },

  /* ---- Account --------------------------------------------------------- */
  '/my-profile': { title: 'My Profile', description: 'Your account: username, password, contact details and profile picture.', keywords: ['my profile', 'account settings'] },
};

/** Shown for the signed-out view, which is the only page a crawler can reach. */
export const SIGNED_OUT_META = {
  title: 'Sign in',
  description: 'NexorCRM is a CRM and business management platform for managing leads, customers, opportunities, campaigns, projects and sales.',
  keywords: [...BASE_KEYWORDS, 'CRM system', 'customer relationship management', 'sales CRM', 'opportunity management', 'business management software'],
  indexable: true,
};

/** Used when no entry matches — better than leaving the previous page's title. */
export const FALLBACK_META = {
  title: 'Page not found',
  description: 'That address does not match any page in NexorCRM.',
  keywords: BASE_KEYWORDS,
};

/* --------------------------------------------------------------------------
   Matching
   -------------------------------------------------------------------------- */

/** Turns '/leads/:id' into a regex that matches one segment per parameter. */
const toPattern = (route) => new RegExp(
  `^${route.replace(/:[^/]+/g, '[^/]+').replace(/\//g, '\\/')}\\/?$`,
);

// Most specific first: more segments wins, and a literal beats a :param.
const ROUTES = Object.keys(PAGE_META)
  .map((route) => ({
    route,
    pattern: toPattern(route),
    depth: route.split('/').filter(Boolean).length,
    params: (route.match(/:/g) || []).length,
  }))
  .sort((a, b) => b.depth - a.depth || a.params - b.params);

/**
 * Finds the metadata for a path.
 *
 * @param {string} pathname
 * @returns {{title: string, description: string, keywords: string[]}}
 */
export function resolvePageMeta(pathname) {
  const clean = (pathname || '/').split('?')[0].split('#')[0];
  const hit = ROUTES.find((r) => r.pattern.test(clean));
  const meta = hit ? PAGE_META[hit.route] : FALLBACK_META;
  return {
    ...meta,
    keywords: [...BASE_KEYWORDS, ...(meta.keywords || [])],
  };
}

/* --------------------------------------------------------------------------
   Applying
   -------------------------------------------------------------------------- */

/** Creates the tag if it is missing, so index.html does not have to list them. */
function setMeta(selector, attrs, content) {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel, href) {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Writes one page's metadata into the document head.
 *
 * @param {object} meta         from resolvePageMeta(), or SIGNED_OUT_META
 * @param {object} [options]
 * @param {string} [options.detail]  a record's own name, shown before the page
 *                                   title — "Hemanth · Lead Profile | NexorCRM"
 */
export function applyPageMeta(meta, { detail } = {}) {
  if (typeof document === 'undefined' || !meta) return;

  const title = meta.fullTitle
    || `${detail ? `${detail} · ` : ''}${meta.title}${titleSuffix()}`;
  const description = meta.description || '';
  const image = new URL(meta.image || SITE_IMAGE, window.location.origin).href;
  const imageAlt = meta.imageAlt || `${meta.title} — ${brandName()}`;
  const url = `${window.location.origin}${window.location.pathname}`;

  document.title = title;

  /* ---- the page itself -------------------------------------------------- */
  setMeta('meta[name="description"]', { name: 'description' }, description);
  setMeta('meta[name="keywords"]', { name: 'keywords' }, (meta.keywords || []).join(', '));
  setMeta('meta[name="author"]', { name: 'author' }, brandName());
  setMeta('meta[name="application-name"]', { name: 'application-name' }, brandName());
  setMeta('meta[name="apple-mobile-web-app-title"]', { name: 'apple-mobile-web-app-title' }, brandName());

  /* ---- Open Graph: what Slack, Teams and WhatsApp read ------------------ */
  setMeta('meta[property="og:type"]', { property: 'og:type' }, 'website');
  setMeta('meta[property="og:site_name"]', { property: 'og:site_name' }, brandName());
  setMeta('meta[property="og:locale"]', { property: 'og:locale' }, LOCALE);
  setMeta('meta[property="og:title"]', { property: 'og:title' }, title);
  setMeta('meta[property="og:description"]', { property: 'og:description' }, description);
  setMeta('meta[property="og:url"]', { property: 'og:url' }, url);
  setMeta('meta[property="og:image"]', { property: 'og:image' }, image);
  setMeta('meta[property="og:image:alt"]', { property: 'og:image:alt' }, imageAlt);

  /* ---- Twitter / X ------------------------------------------------------ */
  setMeta('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary_large_image');
  setMeta('meta[name="twitter:title"]', { name: 'twitter:title' }, title);
  setMeta('meta[name="twitter:description"]', { name: 'twitter:description' }, description);
  setMeta('meta[name="twitter:image"]', { name: 'twitter:image' }, image);
  setMeta('meta[name="twitter:image:alt"]', { name: 'twitter:image:alt' }, imageAlt);

  /* ---- Crawling ---------------------------------------------------------
     Everything behind the login is noindex: a crawler cannot sign in, so the
     only thing indexing these URLs achieves is publishing the app's structure. */
  setMeta(
    'meta[name="robots"]',
    { name: 'robots' },
    meta.indexable
      ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
      : 'noindex, nofollow',
  );

  // The canonical follows the real URL rather than a placeholder domain, and
  // drops the query string so ?tab=… does not fork into separate URLs.
  setLink('canonical', url);

  applyThemeColor();
}

/**
 * Keeps the browser chrome in step with the app's theme.
 *
 * Exported because the theme can change without a navigation — the toggle in
 * the header — and the tint should follow it rather than waiting for the next
 * page.
 */
/**
 * Point the whole document at a tenant's brand.
 *
 * Call once when the branding API has resolved. From that point on every
 * tab title ends with the company's name, the browser tab icon switches to
 * the company's favicon, and open-graph/author tags read the company too.
 * Passing { name: null } or no arguments resets to the platform default.
 */
export function applyBranding({ name = null, faviconUrl = null } = {}) {
  activeBrand = name && String(name).trim() ? String(name).trim() : DEFAULT_BRAND;
  activeFaviconUrl = faviconUrl || null;
  if (typeof document === 'undefined') return;
  // Favicon — leave the <link rel="icon"> alone when no override is given, so
  // the static /favicon.png in index.html stays authoritative on the platform.
  if (activeFaviconUrl) {
    setLink('icon', activeFaviconUrl);
    setLink('apple-touch-icon', activeFaviconUrl);
  } else {
    setLink('icon', '/favicon.png');
    setLink('apple-touch-icon', '/favicon.png');
  }
  // Repaint the title/meta tags so the change is visible without a navigation.
  const current = resolvePageMeta(window.location.pathname);
  applyPageMeta(current);
}

export function applyThemeColor() {
  if (typeof document === 'undefined') return;
  const dark = document.documentElement.dataset.theme === 'dark'
    || document.body?.classList.contains('dark-mode')
    || (!document.documentElement.dataset.theme
      && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  setMeta('meta[name="theme-color"]', { name: 'theme-color' }, dark ? THEME_COLOR.dark : THEME_COLOR.light);
}
