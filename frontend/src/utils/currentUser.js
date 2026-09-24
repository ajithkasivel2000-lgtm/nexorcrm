/**
 * Who is signed in, and what they are allowed to do.
 *
 * The checks were written inline in a dozen places as
 * `localStorage.getItem('loggedInUser') === 'admin'`, which meant a new screen
 * could silently get it wrong — or forget it entirely. One place instead.
 *
 * These are for *presentation only*: hiding a button the server would refuse
 * anyway. Every rule here is enforced again in the API, because anything that
 * lives only in the browser is a suggestion, not a permission.
 */

/** The signed-in username, or '' when nobody is. */
export function currentUsername() {
  try {
    return localStorage.getItem('loggedInUser') || '';
  } catch {
    // Private windows and blocked site data both throw on access.
    return '';
  }
}

/** The role stored at sign-in, or '' when unknown. */
export function currentStatus() {
  try {
    return localStorage.getItem('userStatus') || '';
  } catch {
    return '';
  }
}

/**
 * The superadmin — the one account that can delete records.
 *
 * Matches on either signal: the reserved 'admin' username, or the
 * 'superadmin' status the API reports.
 */
export function isSuperAdmin() {
  return currentUsername() === 'admin' || currentStatus().toLowerCase() === 'superadmin';
}

/** Whether the signed-in user may delete records. */
export function canDelete() {
  return isSuperAdmin();
}

/**
 * Whether a user *record* is the superadmin — the same two signals as
 * isSuperAdmin(), but asked about someone else rather than the signed-in user.
 *
 * Used to keep the reserved 'admin' account out of pickers: it owns duplicate
 * leads by design, so it is not a person you assign work to by hand.
 */
export function isSuperAdminUser(u) {
  if (!u) return false;
  return u.username === 'admin' || String(u.status || '').toLowerCase() === 'superadmin';
}

/** Drops the superadmin from a list of users, for owner/assignee pickers. */
export function assignableUsers(list = []) {
  return list.filter((u) => !isSuperAdminUser(u));
}
