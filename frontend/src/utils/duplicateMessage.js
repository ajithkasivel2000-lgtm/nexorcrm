/**
 * Explaining to whoever typed a lead why it was treated as a repeat.
 *
 * A lead that saves and then turns into a "Duplicate" owned by somebody else
 * is bewildering: it leaves the person's list with no reason given, and the
 * only place the reason existed was a log entry on a record they no longer
 * own. This puts the whole thing in front of them at the moment it happens —
 * what matched, which earlier Leads it matched, who holds that one, and
 * where this lead has gone.
 */

const DATE = { day: '2-digit', month: 'short', year: 'numeric' };

function whenText(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', DATE);
}

/**
 * The dialog title, which says how certain the match is.
 *
 * @param {object} duplicate  the `duplicate` block from the create response
 */
export function duplicateTitle(duplicate) {
  return duplicate?.kind === 'Duplicate'
    ? 'This Leads already exists'
    : 'This may already exist';
}

/**
 * The explanation, as plain lines.
 *
 * @param {object} duplicate  the `duplicate` block from the create response
 * @param {object} lead       the lead that was just created
 * @returns {string}
 */
export function duplicateMessage(duplicate, lead) {
  if (!duplicate) return '';

  const { kind, matchedOn, original = {}, project, mobile, email, assignedTo } = duplicate;
  const certain = kind === 'Duplicate';
  const who = lead?.name || 'This customer';
  const lines = [];

  /* ---- what happened --------------------------------------------------- */
  lines.push(certain
    ? `${who} has already enquired about ${project || 'this project'}.`
    : `${who} may have already enquired about ${project || 'this project'}.`);
  lines.push('');

  /* ---- why ------------------------------------------------------------- */
  // "the mobile number and email address matches" reads as a mistake; the
  // verb has to follow how many things actually matched.
  const plural = String(matchedOn).includes(' and ');
  lines.push(`Why: the ${matchedOn} ${plural ? 'are' : 'is'} the same as an earlier lead on this project.`);
  if (mobile) lines.push(`   Phone:  ${mobile}`);
  if (email) lines.push(`   E-mail: ${email}`);
  lines.push('');

  /* ---- which one ------------------------------------------------------- */
  const created = whenText(original.createdAt);
  lines.push(`Existing lead: ${original.id}${original.name ? ` — ${original.name}` : ''}`);
  if (created) lines.push(`   Created: ${created}`);
  if (original.owner) lines.push(`   Owner:   ${original.owner}`);
  if (original.status) lines.push(`   Status:  ${original.status}`);
  lines.push('');

  /* ---- where this one went --------------------------------------------- */
  lines.push(`This lead has been saved as "${kind}" and assigned to ${assignedTo || 'the super admin'}`);
  lines.push('instead of the round-robin queue, so the same customer is not');
  lines.push('worked by two people. You will not see it in your own list.');

  if (!certain) {
    lines.push('');
    lines.push('The phone numbers differ, so this may be a different person at');
    lines.push('the same address — a family member, or a shared company inbox.');
    lines.push('The super admin can release it if it is genuinely new.');
  }

  return lines.join('\n');
}
