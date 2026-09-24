/**
 * The permissions a role starts with.
 *
 * Permissions are stored per user, but nobody wants to tick fourteen pages by
 * hand every time somebody joins. Changing a person's role applies that role's
 * template, and it can be re-applied later from the user's own screen.
 *
 * They remain per-user afterwards: the template is a starting point, not a
 * binding. An administrator can grant one extra page to one person without
 * touching anybody else, which is the whole reason permissions live on the
 * user rather than on the role.
 *
 * The shape below lists only what is GRANTED. Anything unlisted is denied, and
 * a page absent from a role's map entirely is closed to that role.
 */

const { SETTINGS_PAGES } = require('./pages');

const VIEW = ['view'];
const VIEW_EDIT = ['view', 'edit'];
const VIEW_CREATE_EDIT = ['view', 'create', 'edit'];
const FULL = ['view', 'create', 'edit', 'delete', 'export'];

/**
 * A normal user — the front line.
 *
 * They work leads and opportunities: look at them, add them, update them.
 * Deliberately no `delete` and no `export` anywhere. Deleting a customer
 * record should be a decision someone senior makes, and export is how a
 * complete customer list leaves the building on a memory stick.
 */
const USER = {
  dashboard: VIEW,
  leads: VIEW_CREATE_EDIT,
  opportunities: VIEW_EDIT,
  customers: VIEW,
  report: VIEW,               // can read reports, cannot export them
  projects: VIEW,
  'channel-partners': VIEW,
  rrq: VIEW,
  bookings: VIEW,
  'team-chat': VIEW,
  assistant: VIEW,
  // import-leads, user-admin, user-groups and settings are absent: no access.
};

/**
 * A manager — runs a team and answers for its numbers.
 *
 * Everything a user has, plus creating and exporting across the pipeline, bulk
 * import, and delete on leads. Still no access to user administration or
 * system settings: managing people and configuring the CRM are an admin's job.
 */
const MANAGER = {
  dashboard: VIEW,
  leads: FULL,
  'import-leads': ['view', 'create'],
  opportunities: ['view', 'create', 'edit', 'export'],
  customers: ['view', 'export'],
  report: ['view', 'export'],
  projects: ['view', 'create', 'edit', 'export'],
  'channel-partners': ['view', 'create', 'edit', 'export'],
  rrq: ['view', 'create', 'edit', 'export'],
  bookings: ['view', 'create', 'edit', 'export'],
  'team-chat': VIEW,
  assistant: VIEW,
  'user-admin': VIEW,         // can see the team, cannot change accounts
};

/** An admin — everything, including user administration and settings. */
const ADMIN = {
  dashboard: VIEW,
  leads: FULL,
  'import-leads': ['view', 'create'],
  opportunities: FULL,
  customers: FULL,
  report: ['view', 'export'],
  projects: FULL,
  'channel-partners': FULL,
  rrq: FULL,
  bookings: FULL,
  'team-chat': VIEW,
  assistant: VIEW,
  'user-admin': FULL,
  'user-groups': FULL,
  settings: ['view', 'edit'],
};

/**
 * Keyed by the value stored in `User.status`.
 *
 * 'Employee' is the stored name for the role the app calls "User" — see
 * roleLabel in userController. Registered is a brand-new account that has not
 * been given a role yet, so it gets the same as a user.
 */
const ROLE_DEFAULTS = {
  Admin: ADMIN,
  superadmin: ADMIN,
  Manager: MANAGER,
  Employee: USER,
  Registered: USER,
};

/** The template for a role, or null when the role has none. */
const defaultsFor = (status) => ROLE_DEFAULTS[status] || null;

/**
 * The template expanded into the shape setPermission expects:
 * `{ page: { view, create, edit, delete, export } }`.
 */
function expandedDefaults(status) {
  const template = defaultsFor(status);
  if (!template) return null;

  const out = {};
  for (const [page, granted] of Object.entries(template)) {
    const actions = {
      view: granted.includes('view'),
      create: granted.includes('create'),
      edit: granted.includes('edit'),
      delete: granted.includes('delete'),
      export: granted.includes('export'),
    };

    /* 'settings' in a template is shorthand for every settings screen — the
       app has no page by that name, it has eight. Unexpanded it travelled on
       as a page id and setUserPermission rejected it, and because the role
       handler clears the old rows and then applies the defaults in a loop,
       the throw left a freshly promoted Admin with no settings access at all.
       It was only visible as a line in the server log. */
    if (page === 'settings') {
      for (const settingsPage of SETTINGS_PAGES) out[settingsPage] = { ...actions };
      continue;
    }

    out[page] = actions;
  }
  return out;
}

/** A one-line summary for a confirmation dialog or an audit entry. */
function describeDefaults(status) {
  // Counted after expansion, so "settings" is reported as the eight pages it
  // actually grants rather than as one.
  const expanded = expandedDefaults(status);
  if (!expanded) return 'no default permissions';
  const pages = Object.keys(expanded).length;
  return `${pages} page${pages === 1 ? '' : 's'}`;
}

module.exports = { ROLE_DEFAULTS, defaultsFor, expandedDefaults, describeDefaults };
