const prisma = require('../prismaClient');
const { validateEmail } = require('./email');
const { validatePhone } = require('./phone');
const { findDuplicateLead, DUPLICATE_STATUSES } = require('./leadDuplicate');
const { PRESALES_RRQ_TYPE } = require('./rrqTypes');
const { rotaFor, resolveUser, isAvailable } = require('./leadRoundRobin');
const { startAssignmentTimer } = require('./leadAssignment');
const { findCompanySuperAdmin } = require('./companyAdmin');

/**
 * Every way a lead arrives without a person typing it in — the website form,
 * campaign links, Facebook/Instagram Lead Ads, Google Ads lead forms — goes
 * through here, so they all get the same treatment:
 *
 *   1. contact details validated (a lead with no usable number helps nobody)
 *   2. the project resolved by id or name
 *   3. the next available seat on the project's presales rota, or the
 *      project's developer, or the company's super admin
 *   4. repeats marked as duplicates and parked with the super admin
 *   5. the follow-up clock started, which also tells the owner
 *
 * This used to be two near-identical 150-line blocks in leadController (and
 * the rota walk there did not skip suspended or archived people).
 */

class IntakeError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

/** Resolve a project by id or name. */
async function resolveProject(project) {
  if (!project) return { projectId: null, projectName: 'General' };
  const rec = await prisma.project.findFirst({ where: { OR: [{ id: String(project) }, { projectName: String(project) }] } });
  return rec
    ? { projectId: rec.id, projectName: rec.projectName, developerId: rec.developerId }
    : { projectId: String(project), projectName: String(project) };
}

/**
 * The seat after whoever took the project's last lead, skipping anyone who is
 * unavailable. Unlike reassignment, a new lead may go back to the same person
 * when they are the only one free.
 */
async function nextRotaOwner(projectId, projectName) {
  const seats = await rotaFor(projectName, PRESALES_RRQ_TYPE);
  if (!seats.length) return null;

  const lastLead = await prisma.lead.findFirst({
    where: {
      status: { notIn: DUPLICATE_STATUSES },
      OR: [{ project: projectId || projectName }, { project: projectName }],
    },
    orderBy: { createdAt: 'desc' },
    select: { owner: true, ownerId: true },
  });
  let lastIndex = -1;
  if (lastLead) {
    const last = await resolveUser(lastLead.ownerId || lastLead.owner);
    if (last) lastIndex = seats.findIndex((u) => u.id === last.id);
  }
  for (let step = 1; step <= seats.length; step += 1) {
    const candidate = seats[(lastIndex + step) % seats.length];
    if (isAvailable(candidate)) return candidate;
  }
  return null;
}

/**
 * Create a lead from an outside source for the current company.
 *
 * @param {object} input
 * @param {string} input.name
 * @param {string} input.mobile
 * @param {string} [input.mobileCountryCode]
 * @param {string} [input.email]
 * @param {string} [input.project]          id or name
 * @param {string} [input.primarySource]
 * @param {string} [input.secondarySource]
 * @param {string} [input.notes]
 * @param {string} [input.channelPartnerId]   the partner who brought the lead
 * @param {string} [input.channelPartnerName]
 * @param {string} input.creator            'Website', 'Campaign', 'Facebook Lead Ads', ...
 * @param {string} [input.logSubtitle]      how it arrived, for the lead's history
 * @returns {Promise<object>} the created lead
 * @throws {IntakeError} (status 400) for invalid input
 */
async function intakeLead(input) {
  const name = String(input.name || '').trim();
  if (!name || !input.mobile) throw new IntakeError('Name and mobile are required.');

  let email;
  try {
    email = validateEmail(input.email, { allowEmpty: true }) || null;
  } catch (err) {
    throw new IntakeError(err.message);
  }
  let mobile;
  try {
    mobile = validatePhone(input.mobile, input.mobileCountryCode);
  } catch (err) {
    throw new IntakeError(err.message);
  }

  const { projectId, projectName, developerId } = await resolveProject(input.project);
  const superAdmin = await findCompanySuperAdmin();

  let owner = await nextRotaOwner(projectId, projectName);
  if (!owner && developerId) {
    const dev = await prisma.user.findUnique({ where: { id: developerId } });
    if (isAvailable(dev)) owner = dev;
  }
  if (!owner) owner = superAdmin;

  // A repeat is kept but marked, and goes to the super admin rather than
  // consuming a turn of the rota.
  const match = await findDuplicateLead(prisma, { mobile, email, projectId, projectName });
  if (match && superAdmin) owner = superAdmin;

  const ownerId = owner ? owner.id : null;
  const lead = await prisma.lead.create({
    data: {
      name,
      mobile,
      mobileCountryCode: input.mobileCountryCode || undefined,
      email,
      primarySource: input.primarySource || input.creator || 'Website',
      secondarySource: input.secondarySource || null,
      status: match ? match.kind : 'New Lead',
      project: projectId || projectName,
      owner: ownerId || 'unassigned',
      ownerId,
      otherNotes: input.notes || null,
      channelPartnerId: input.channelPartnerId || null,
      channelPartnerName: input.channelPartnerName || null,
      logs: {
        create: {
          title: match ? `${match.kind} ${input.creator} Lead` : `${input.creator} Lead Created`,
          subtitle: match
            ? `${input.logSubtitle || `via ${input.creator}`} — same ${match.matchedOn} as ${match.lead.id}`
            : (input.logSubtitle || `via ${input.creator}`),
        },
      },
    },
  });

  /* Through the follow-up clock: an unanswered lead moves to the next seat on
     the rota instead of waiting forever, and the owner is told once — by the
     clock, or directly when none opens. */
  if (ownerId) {
    const ownerName = owner.username || owner.firstName || 'Admin';
    setImmediate(() => {
      startAssignmentTimer(lead, {
        ownerId,
        ownerName,
        source: 'round-robin',
        notify: true,
        notifyContext: { ownerName, projectName, creator: input.creator },
      });
    });
  }
  return lead;
}

module.exports = { intakeLead, IntakeError };
