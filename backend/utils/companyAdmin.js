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
 * Whether a username is in use anywhere on the platform.
 *
 * Usernames are unique across every company (a username is how sign-in knows
 * which company you belong to), but ordinary queries only see the current
 * company — so "is it taken?" has to look past it, or a clash would only
 * surface as a failed insert.
 */
function isUsernameTaken(username) {
  return runAsSystem(() => prisma.user.findUnique({ where: { username }, select: { id: true } }))
    .then(Boolean);
}

module.exports = { findCompanySuperAdmin, isUsernameTaken };
