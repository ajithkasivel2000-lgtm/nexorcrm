/**
 * Site-wide SEO settings for the public NexorCRM website.
 *
 * This is the one file to edit for:
 *   - the public address (SITE_URL)
 *   - Google Search Console / Bing verification codes
 *   - contact details shown on the public pages and in the Organization schema
 *   - the home page's title and description
 *
 * Read by the Vite plugin (seo/vite-plugin.js) at build time and by
 * src/utils/pageMeta.js in the browser, so it must stay plain data: no
 * `process`, no Node imports.
 */

export const BRAND = 'NexorCRM';

/**
 * The canonical public address, with no trailing slash. Every canonical URL,
 * sitemap entry and structured-data URL is built from it. The SITE_URL
 * environment variable overrides it at build time.
 */
export const DEFAULT_SITE_URL = 'https://os.nexorcrm.com';

/**
 * Search engine verification (HTML meta tag method).
 *
 * Google Search Console → Add property → URL prefix → "HTML tag": copy only
 * the content="…" value into `google`. Or set GOOGLE_SITE_VERIFICATION when
 * running `npm run build`. Rebuild and deploy, then press Verify.
 * (A Domain property is verified with a DNS TXT record instead, and needs
 * nothing here.)
 */
export const SEARCH_CONSOLE = {
  google: '',
  bing: '',
};

/**
 * Public contact details. Left blank on purpose: nothing is shown or put in
 * structured data until a real address or number is filled in here.
 */
export const CONTACT = {
  email: '',
  phone: '',
};

/** The share image for links to the site (1200×630, in frontend/public). */
export const OG_IMAGE = '/og-image.png';
export const OG_IMAGE_ALT = 'NexorCRM – CRM software for leads, sales pipeline and projects';

/**
 * The home page ("/", the sign-in screen). Its primary keyword is the brand,
 * so it does not compete with /crm-software for "CRM software for business".
 */
export const HOME = {
  title: 'NexorCRM | CRM Software for Leads, Sales Pipeline & Projects',
  description: 'NexorCRM is web-based CRM software for managing enquiries, leads, sales pipelines, projects, bookings and teams in one place. Sign in or start a free trial.',
};

/** Short description of the product, used in the SoftwareApplication schema. */
export const PRODUCT_DESCRIPTION = 'Web-based customer relationship management (CRM) software for capturing and assigning leads, managing a sales pipeline, projects and inventory, bookings and payment collections, with automation, reports and team collaboration.';

/** What the product does, for SoftwareApplication.featureList. Only real features. */
export const FEATURE_LIST = [
  'Lead capture from website forms, campaign links, Facebook and Instagram Lead Ads, Google Ads lead forms and CSV/Excel import',
  'Duplicate lead detection',
  'Automatic lead assignment by project rota',
  'Follow-up reminders and automatic lead reassignment',
  'Sales pipeline with opportunity stages and deal health',
  'Customer, project and unit inventory management',
  'Site visit scheduling and reminders',
  'Bookings, payment milestones, payment links and collection reminders',
  'Channel partner portal and buyer portal',
  'WhatsApp Business and Exotel click-to-call integration',
  'Dashboards, report builder and scheduled email reports',
  'Team chat, notifications and calendar feed',
  'Roles, page-level permissions, two-factor authentication and audit logs',
];
