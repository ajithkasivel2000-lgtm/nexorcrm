const prisma = require('../prismaClient');
const { isSuperUser, isManagerUser } = require('./authMiddleware');
const { isSamePerson } = require('../utils/leadPeople');

/**
 * Whether this user may open this lead at all.
 *
 * Mirrors the scope getLeads applies to the list, so a lead that is not in a
 * person's list cannot be reached by typing its id either. Lead ids are
 * sequential (LED-2026-001, -002, …), so without this any employee could read
 * and edit every lead in the system by counting.
 *
 *   superadmin / Admin  every lead
 *   Manager             leads owned by a Manager or an Employee
 *   everyone else       leads they own, or allocated (read-only, see below)
 */
async function canAccessLead(lead, user) {
  if (!lead || !user) return false;
  if (isSuperUser(user)) return true;
  if (isSamePerson(lead.owner, user) || isSamePerson(lead.ownerId, user)
    || isSamePerson(lead.allocator, user)) {
    return true;
  }
  if (isManagerUser(user)) {
    const keys = [lead.ownerId, lead.owner].filter(Boolean).map(String);
    if (!keys.length) return false;
    const owner = await prisma.user.findFirst({
      where: { OR: [{ id: { in: keys } }, { username: { in: keys } }] },
      select: { status: true },
    });
    return Boolean(owner) && ['Manager', 'Employee'].includes(owner.status);
  }
  return false;
}

/** Route guard for every /api/leads/:id endpoint. */
function requireLeadAccess(req, res, next) {
  prisma.lead
    .findUnique({
      where: { id: req.params.id },
      select: { owner: true, ownerId: true, allocator: true },
    })
    .then(async (lead) => {
      // A lead that does not exist is the controller's 404 to give.
      if (!lead) return next();
      if (await canAccessLead(lead, req.user)) return next();
      // 404 rather than 403: the id's existence is itself not theirs to learn.
      return res.status(404).json({ message: 'Not found' });
    })
    .catch((error) => {
      console.error('Lead access check failed:', error.message);
      res.status(500).json({ message: 'Could not check access to this lead.' });
    });
}

/**
 * A lead that has been handed on is read-only for the person who handed it on.
 *
 * Allocating a lead moves the work to somebody else. The allocator keeps the
 * lead in sight — they are still answerable for it, and its history names them
 * — but two people editing one record from opposite sides is how a follow-up
 * date gets overwritten by somebody who is no longer making the calls.
 *
 * So: the owner edits, the allocator reads. Administrators and the superadmin
 * are exempt, because they have to be able to correct any record.
 *
 * Written as a route guard rather than a check inside each controller: the
 * lead has three separate write endpoints (`/:id`, `/:id/status`,
 * `/:id/fields`), and a rule enforced in two of three is not a rule.
 */

function blockAllocatorEdits(req, res, next) {
  // Administrators can always correct a record.
  if (isSuperUser(req.user)) return next();

  prisma.lead
    .findUnique({ where: { id: req.params.id }, select: { owner: true, allocator: true } })
    .then((lead) => {
      // A lead that does not exist is the controller's 404 to give, not ours.
      if (!lead) return next();

      const owner = isSamePerson(lead.owner, req.user);
      const allocator = isSamePerson(lead.allocator, req.user);

      /* Only when they are the allocator and NOT the owner. Allocating a lead
         back to yourself leaves you as both, and that must stay editable. */
      if (allocator && !owner) {
        return res.status(403).json({
          message: 'You allocated this lead, so it is read-only for you. '
            + `${lead.owner || 'Its owner'} can edit it, or an administrator.`,
        });
      }

      return next();
    })
    .catch((error) => {
      console.error('Lead access check failed:', error.message);
      res.status(500).json({ message: 'Could not check access to this lead.' });
    });
}

/**
 * The same rule the guard enforces, as a question the API can answer for the
 * browser. Asked once when the record is fetched, so the page can render
 * itself read-only instead of re-deriving the rule and drifting from it.
 */
function isReadOnlyForViewer(lead, user) {
  if (!user || isSuperUser(user)) return false;
  return isSamePerson(lead?.allocator, user) && !isSamePerson(lead?.owner, user);
}

module.exports = { blockAllocatorEdits, isReadOnlyForViewer, canAccessLead, requireLeadAccess };
