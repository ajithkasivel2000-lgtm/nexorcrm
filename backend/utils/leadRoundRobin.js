/**
 * The project round-robin, as a function.
 *
 * The rota already existed, inline in leadController.createLead: an RRQ row
 * per project holds `assignedUsers` in the order people take turns, and the
 * next owner is the one after the current holder. Automatic reassignment has
 * to advance the same rota, so the rule lives here where both can call it.
 *
 * createLead is deliberately left alone. It still runs its own copy for the
 * assignment it makes at creation — that path works and is not worth the risk
 * of rewriting — so this module must agree with it rather than replace it:
 * same RRQ lookup, same `assignedUsers` order, same username-or-id resolution,
 * same modulo step to the next seat. The only thing it adds is the ability to
 * start from a given owner instead of from the project's last lead, which is
 * what a reassignment needs.
 */

const prisma = require('../prismaClient');

/**
 * Statuses that mean an account cannot take work right now.
 *
 * `User.status` doubles as the role ('Admin', 'Manager', 'Employee') and as
 * the lifecycle state, so only the lifecycle words belong here — a role must
 * never make someone ineligible.
 */
const UNAVAILABLE_STATUSES = ['Suspended', 'Banned', 'Locked', 'Archived', 'Inactive', 'Partner', 'Registered', 'Pending'];

/**
 * Username or id to user, the same way leadController does it.
 *
 * The rota stores whatever an administrator typed, so a seat can be either.
 */
async function resolveUser(identifier) {
  if (!identifier) return null;
  try {
    const byId = await prisma.user.findUnique({ where: { id: String(identifier) } });
    if (byId) return byId;
  } catch {
    // Not a uuid — fall through to the username lookup.
  }
  try {
    return await prisma.user.findFirst({ where: { username: String(identifier) } });
  } catch {
    return null;
  }
}

/** Whether this account can be handed a lead. */
function isAvailable(user) {
  if (!user) return false;
  if (user.archivedAt) return false;
  return !UNAVAILABLE_STATUSES.includes(user.status);
}

/**
 * The rota for a project, resolved to real users in seat order.
 *
 * Returns [] when the project has no queue, which is the signal to leave the
 * lead where it is rather than invent an owner for it.
 */
async function rotaFor(projectName, rrqType) {
  if (!projectName) return [];

  const rrq = await prisma.rRQ.findFirst({
    where: { projectName, rrqType },
  });
  if (!rrq || !Array.isArray(rrq.assignedUsers) || rrq.assignedUsers.length === 0) return [];

  const seats = [];
  for (const seat of rrq.assignedUsers) {
    // Sequential on purpose: seat order is the rota order, and resolving in
    // parallel would need re-sorting afterwards for no gain on a list this size.
    // eslint-disable-next-line no-await-in-loop
    const user = await resolveUser(seat);
    if (user) seats.push(user);
  }
  return seats;
}

/**
 * Who should hold this lead next.
 *
 * Starts at the seat after `currentOwnerId` and walks forward, wrapping once,
 * until it finds someone available. An owner who is not in the rota at all
 * (a lead moved by hand to somebody outside it) leaves `index` at -1, so the
 * walk starts at the first seat — the rota resumes from its beginning rather
 * than stalling.
 *
 * Returns null when nobody else can take it, which the caller must treat as
 * "leave it alone": there is no such thing as a safe invalid assignment.
 *
 * @returns {Promise<{user: object, seats: number}|null>}
 */
async function nextOwnerAfter({ projectName, rrqType, currentOwnerId }) {
  const seats = await rotaFor(projectName, rrqType);
  if (seats.length === 0) return null;

  const index = seats.findIndex((u) => u.id === currentOwnerId);

  /* One lap, no more. Starting at index+1 is the same modulo step createLead
     takes; stopping after seats.length tries means a rota where everyone is
     unavailable ends the walk instead of spinning. */
  for (let step = 1; step <= seats.length; step += 1) {
    const candidate = seats[(index + step) % seats.length];
    if (!isAvailable(candidate)) continue;
    /* Requirement: never hand it back to the same person until the rota comes
       round to them. With one usable seat that IS the current owner, there is
       nobody to move it to, so it stays put. */
    if (candidate.id === currentOwnerId) continue;
    return { user: candidate, seats: seats.length };
  }

  return null;
}

module.exports = { nextOwnerAfter, rotaFor, resolveUser, isAvailable, UNAVAILABLE_STATUSES };
