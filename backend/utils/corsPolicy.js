const prisma = require('../prismaClient');
const tenant = require('./tenant');

/**
 * Which web origins may call this API from a browser (CORS).
 *
 * The app is same-origin in production — nginx serves the SPA and proxies
 * /api to this process — so same-origin requests need no CORS at all. An
 * origin only has to be admitted when the page is served from somewhere
 * else than the API's own address:
 *
 *   - development: Vite on localhost:5173 calling the backend on :7003;
 *   - a company on its own domain (crm.client.com) when the API is reached
 *     on the platform's address, and the reverse;
 *   - an explicit allow-list for anything unusual (CORS_EXTRA_ORIGINS).
 *
 * Auth is a bearer token in a header and never cookies, so requests are
 * made with credentials: false and the server reflects no cookies either.
 * A wildcard (*) used to be open here: it served no legitimate cross-origin
 * caller and only widened the surface for scripts running in someone
 * else's signed-in browser.
 *
 * Company domains are read from the database with a short cache: the list
 * is needed on every cross-origin preflight, and a settings-style read
 * per preflight would be waste. A newly claimed domain takes effect
 * within the cache window (a minute) without a restart.
 */

const { platformUrl } = require('./companyUrl');

const CACHE_MS = 60 * 1000;
let companyOriginsCache = { at: 0, origins: [] };

async function companyOrigins() {
  if (Date.now() - companyOriginsCache.at < CACHE_MS) return companyOriginsCache.origins;
  try {
    const rows = await tenant.runAsSystem(() => prisma.company.findMany({
      where: { status: 'Active', customDomain: { not: null } },
      select: { customDomain: true },
    }));
    const origins = rows
      .map((r) => r.customDomain)
      .filter(Boolean)
      .map((d) => `https://${String(d).toLowerCase()}`);
    companyOriginsCache = { at: Date.now(), origins };
    return origins;
  } catch (error) {
    // The preflight must not take the API down if the read fails; fall back
    // to the last good list, or none.
    console.error('Could not read company domains for CORS:', error.message);
    return companyOriginsCache.origins;
  }
}

/** Static entries: localhost dev servers and anything the operator added. */
function staticOrigins() {
  const extra = String(process.env.CORS_EXTRA_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return [
    'http://localhost:5173', 'http://127.0.0.1:5173', // Vite dev server
    'http://localhost:4173', 'http://127.0.0.1:4173', // vite preview
    ...extra,
  ];
}

/** The origin allow-list: static entries plus every company's own domain. */
async function allowedOrigins() {
  return [...staticOrigins(), ...(await companyOrigins())];
}

/** The express cors options object. */
function corsOptions() {
  return {
    origin: async (origin, callback) => {
      // Same-origin and server-to-server calls send no Origin header.
      if (!origin) return callback(null, true);
      // The platform's own address, wherever APP_URL points.
      if (origin === platformUrl()) return callback(null, true);
      const allowed = await allowedOrigins();
      if (allowed.includes(origin)) return callback(null, true);
      // Dev convenience: any localhost port, so an unusual dev port is not
      // a config edit. Non-localhost origins must be on the list.
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(null, false); // no CORS headers; the browser refuses
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type', 'Authorization', 'X-Auth-Token', 'X-Session-Id',
      'X-Company-Key', 'X-Hub-Signature-256', 'X-Webhook-Signature', 'X-Webhook-Timestamp',
    ],
    credentials: false, // token auth, never cookies
    maxAge: 86400,
  };
}

/** The Socket.IO origin check: same list, expressed as a predicate. */
async function isOriginAllowed(origin) {
  if (!origin) return true; // native clients (the mobile app) send no Origin
  if (origin === platformUrl()) return true;
  const allowed = await allowedOrigins();
  return allowed.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

module.exports = { corsOptions, isOriginAllowed, allowedOrigins };
