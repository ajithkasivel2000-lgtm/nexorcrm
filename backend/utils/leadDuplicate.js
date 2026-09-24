/**
 * Deciding whether a lead has come in before.
 *
 * The rule is the mobile number and the project: the same person asking about
 * the same project is the same Leads, however they reached us.
 *
 * The email is deliberately not part of it. The form's check used to require
 * it to match as well, which meant the same person, same number, same project
 * slipped through as a new lead whenever they left the email blank or typed a
 * different one — while the same rows arriving by CSV were caught, because the
 * import used mobile and project alone. Worse, `email: undefined` is not a
 * filter in Prisma at all, so the check quietly changed behaviour depending on
 * whether the field was absent or empty.
 *
 * A project is stored as an id on new rows and as a name on older ones, so
 * both forms are matched.
 */

/** The status a confirmed repeat gets: same project, same number. */
const DUPLICATE = 'Duplicate';

/**
 * The status a likely repeat gets: same project and email, different number.
 *
 * Kept separate because it is a weaker signal — a shared family address, a
 * company address, an office landline swapped for a mobile. Worth a look
 * before someone calls, but not worth treating as settled.
 */
const POSSIBLE_DUPLICATE = 'Possible Duplicate';

/**
 * Looks for an earlier lead matching this one.
 *
 * Checked in order of confidence: the number first, then the email. The first
 * match wins, and the oldest lead is returned, since that is the original.
 *
 * @param {object} prisma
 * @param {object} lead
 * @param {string} lead.mobile        the cleaned number
 * @param {string} [lead.email]       the normalised address
 * @param {string} [lead.projectId]   the project's id, when it resolved to one
 * @param {string} [lead.projectName] whatever the caller sent for the project
 * @param {string} [lead.excludeId]   a lead to ignore, when re-checking one
 * @returns {Promise<{lead: object, kind: string, matchedOn: string}|null>}
 */
async function findDuplicateLead(prisma, { mobile, email, projectId, projectName, excludeId } = {}) {
  // Both spellings of the project, when there is one. With no project at all,
  // the contact details alone decide — a second Leads from the same person.
  const projectKeys = [...new Set([projectId, projectName].filter(Boolean))];

  const scope = {};
  if (projectKeys.length) scope.project = { in: projectKeys };
  if (excludeId) scope.id = { not: excludeId };

  const oldest = { orderBy: { createdAt: 'asc' } };

  const address = String(email || '').trim();
  const sameAddress = (a, b) =>
    Boolean(a) && Boolean(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

  /* ---- same project + mobile: a duplicate ------------------------------ */
  if (mobile) {
    const byMobile = await prisma.lead.findFirst({ where: { ...scope, mobile }, ...oldest });
    if (byMobile) {
      // Say when both match. "The number and the email are the same" is a
      // stronger, clearer thing to be told than just "the number".
      const both = sameAddress(address, byMobile.email);
      return {
        lead: byMobile,
        kind: DUPLICATE,
        matchedOn: both ? 'mobile number and email address' : 'mobile number',
        matchedFields: both ? ['mobile', 'email'] : ['mobile'],
      };
    }
  }

  /* ---- same project + email: possibly a duplicate ----------------------- */
  if (address) {
    const byEmail = await prisma.lead.findFirst({
      // Case-insensitively: addresses are stored as typed, and Ajith@ and
      // ajith@ are the same mailbox.
      where: { ...scope, email: { equals: address, mode: 'insensitive' } },
      ...oldest,
    });
    if (byEmail) {
      return {
        lead: byEmail,
        kind: POSSIBLE_DUPLICATE,
        matchedOn: 'email address',
        matchedFields: ['email'],
      };
    }
  }

  return null;
}

/**
 * The statuses that mean this lead is a repeat.
 *
 * The round-robin works out whose turn is next from the owner of the last lead
 * on the project. A repeat is given to the super admin, who is not in the
 * queue — so counting it finds no match and hands the next real lead back to
 * the first person in the list, every time. Excluding these keeps the rota
 * moving evenly.
 */
const DUPLICATE_STATUSES = [DUPLICATE, POSSIBLE_DUPLICATE];

module.exports = { findDuplicateLead, DUPLICATE, POSSIBLE_DUPLICATE, DUPLICATE_STATUSES };
