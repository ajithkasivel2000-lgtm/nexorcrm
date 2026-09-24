/**
 * How a role is written on screen.
 *
 * The database stores 'Employee' but the application has always *called* that
 * role "User" — in the role buttons, in the permission tab, in the sidebar.
 * The mapping existed in two places and was applied in some renderings and not
 * others, so one user could read as "Manager" in the header, "Employee" on the
 * Account card and "User" on the Role card, all at once and all from the same
 * stored value.
 *
 * One function, used everywhere a role is displayed. Storage is untouched:
 * `status` is still 'Employee', and every comparison in the code still tests
 * for 'Employee'. This only decides what a person reads.
 */

const LABELS = {
  Employee: 'User',
  superadmin: 'Super Admin',
  Registered: 'Registered',
};

/** The display name for a stored role. Unknown values pass through unchanged. */
export default function roleLabel(status) {
  if (!status) return '—';
  return LABELS[status] || status;
}

/**
 * A role action turned into a sentence.
 *
 * `demoteToEmployee` is an internal identifier, and it was being written
 * straight into statusReason and shown to administrators as
 * "Reason: Role action: demoteToEmployee". This renders the older stored
 * values readably; new ones are written properly by the server.
 */
export function readableReason(reason) {
  if (!reason) return null;

  const match = String(reason).match(/^Role action:\s*(\w+)$/);
  if (!match) return reason;

  const action = match[1];
  const target = action.replace(/^(promote|demote)To/, '');
  const direction = action.startsWith('promote') ? 'Promoted to' : 'Changed to';
  return `${direction} ${roleLabel(target === 'Registered' ? 'Registered' : target)}`;
}
