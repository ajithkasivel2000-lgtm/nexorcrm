const prisma = require('../prismaClient');
const { runAsSystem } = require('./tenant');

/**
 * The current company's super admin: the account that holds leads nobody else
 * should (duplicates, leads no rota could place) and hears about anything that
 * has no other owner.
 *
 * Before there were several companies this was simply the user named "admin".
 * Usernames are unique across the whole platform, so only one company can have
 * that name; every company's top account is marked by status 'superadmin'
 * instead. The legacy "admin" row still counts, for the original company.
 * Scoped to the current company by prismaClient.js.
 */
function findCompanySuperAdmin() {
  return prisma.user.findFirst({
    where: { OR: [{ status: 'superadmin' }, { username: 'admin' }] },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Whether this username is already in use somewhere on the platform.
 *
 * Usernames are unique PER COMPANY now, not globally — so two companies may
 * share one. OAuth username generation and the company-provisioning signup
 * flow still check cross-company because they are picking a login name for a
 * brand-new account before the request has a company context, and refusing a
 * clash upfront reads better than letting the DB reject it. findFirst instead
 * of findUnique is what the composite constraint demands.
 */
function isUsernameTaken(username) {
  return runAsSystem(() => prisma.user.findFirst({ where: { username }, select: { id: true } }))
    .then(Boolean);
}

module.exports = { findCompanySuperAdmin, isUsernameTaken };
