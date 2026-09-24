const { AsyncLocalStorage } = require('async_hooks');

/**
 * Which company the current piece of work belongs to.
 *
 * Every tenant table carries companyId, and prismaClient.js reads the company
 * from here to scope every query: reads are filtered to it, writes are stamped
 * with it. Controllers never mention companyId, so none of them can forget it.
 *
 * The context follows the work through awaits, timers and setImmediate
 * (AsyncLocalStorage), so a notification sent after the response still lands
 * in the right company.
 *
 * Modes:
 *   { companyId }          normal: scoped to that company
 *   { resolving: true }    unauthenticated entry points (login, public lead
 *                          forms, webhooks) that must first find out WHICH
 *                          company they are serving. Reads are unscoped so
 *                          they can look up a globally unique key (username,
 *                          token, company key); writes are refused until
 *                          adopt() names the company.
 *   { system: true }       platform work that spans companies (listing
 *                          companies for the background jobs, the platform
 *                          admin screens). Unscoped; writes must carry
 *                          companyId themselves.
 *
 * No context at all is an error, not "everything": a code path that was
 * missed fails loudly instead of reading every company's data.
 */
const storage = new AsyncLocalStorage();

const DEFAULT_COMPANY_ID = 'CMP-DEFAULT';

const current = () => storage.getStore() || null;
const currentCompanyId = () => current()?.companyId || null;

/* Prisma queries are lazy: prisma.x.findMany() only runs when awaited. Were
   fn's result returned straight out of storage.run(), the await would happen
   after the context had ended and the query would run with no company. So fn
   is awaited inside the context. */
const within = (ctx, fn) => storage.run(ctx, async () => await fn());

/** Run fn scoped to one company. */
const runWithCompany = (companyId, fn) => {
  if (!companyId) throw new Error('runWithCompany needs a company id');
  return within({ companyId }, fn);
};

/** Run fn with unscoped, cross-company access. Platform work only. */
const runAsSystem = (fn) => within({ system: true }, fn);

/** Run fn as an entry point that has yet to learn its company. */
const runResolving = (fn) => within({ resolving: true }, fn);

/**
 * Name the company for the rest of this request. Used by resolving entry
 * points once they know it — after the user is found, or the company key
 * checked.
 */
function adopt(companyId) {
  const ctx = current();
  if (!ctx) throw new Error('adopt() called outside a tenant context');
  if (!companyId) throw new Error('adopt() needs a company id');
  if (ctx.companyId && ctx.companyId !== companyId) {
    throw new Error('This request already belongs to another company');
  }
  ctx.companyId = companyId;
  ctx.resolving = false;
  ctx.system = false;
}

/** Express middleware: the route runs in resolving mode. */
const resolvingRoute = (req, res, next) => runResolving(() => next());

module.exports = {
  DEFAULT_COMPANY_ID,
  current,
  currentCompanyId,
  runWithCompany,
  runAsSystem,
  runResolving,
  adopt,
  resolvingRoute,
};
