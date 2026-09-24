/**
 * Who is who on a lead, from the lead's own history.
 *
 * `Lead.allocator` holds one name — whoever moved the lead last — because it is
 * overwritten on every handover. That is the right answer to "who moved this
 * lead most recently" and the wrong answer to "who gave me this lead", which is
 * what the person reading the record actually wants to know. After
 * admin → subodh → ajith, the field says "subodh" for everyone, so subodh saw
 * himself listed as the person who allocated him his own lead.
 *
 * The chain survives in the lead log: every handover writes a row with
 * field 'owner', the previous owner in oldValue, the new one in newValue and
 * who did it in actor. These read that back.
 */

/** owner/allocator are usually usernames, but older rows may hold a user id. */
const isSamePerson = (stored, user) => {
  if (!stored || !user) return false;
  const s = String(stored).trim().toLowerCase();
  return s === String(user.username || '').trim().toLowerCase()
    || s === String(user.id || '').trim().toLowerCase();
};

/** The handovers, oldest first. */
const handoversOf = (lead) => (lead?.logs || [])
  .filter((entry) => entry.field === 'owner')
  .sort((a, b) => new Date(a.date) - new Date(b.date));

/**
 * Who handed this lead to the person looking at it.
 *
 * Falls back to the stored allocator for anyone who has never owned it — an
 * administrator looking on was never given the lead by anybody, so the most
 * recent handover is the only meaningful answer for them.
 */
function allocatorForViewer(lead, user) {
  if (!user) return lead?.allocator ?? null;

  const handovers = handoversOf(lead);
  for (let i = handovers.length - 1; i >= 0; i -= 1) {
    if (isSamePerson(handovers[i].newValue, user)) {
      return handovers[i].actor || lead.allocator || null;
    }
  }
  return lead?.allocator ?? null;
}

module.exports = { isSamePerson, handoversOf, allocatorForViewer };
