/**
 * The built-in superadmin account.
 *
 * It is a real user row — it has to be, so it can own sessions and audit
 * entries like anyone else — but it is not a member of staff. Nobody assigns
 * it a lead, adds it to a group, or puts it on an RRQ, so it has no business
 * appearing in the pickers that do those things.
 *
 * The name was written out at each call site, which is why some lists hid it
 * and others did not. One definition here, so a screen either opts in by
 * calling this or is visibly missing it.
 */
export const SUPER_ADMIN_USERNAME = 'admin';

export const isSuperAdmin = (user) =>
  (typeof user === 'string' ? user : user?.username) === SUPER_ADMIN_USERNAME;

/**
 * Drop the superadmin from a list of users.
 *
 * Filter where the list is *displayed*, not where it is fetched: a screen that
 * also resolves an id back to a name still needs the full set, or an already
 * assigned superadmin reads back as a bare UUID.
 */
export const withoutSuperAdmin = (users) => (users || []).filter((u) => !isSuperAdmin(u));
