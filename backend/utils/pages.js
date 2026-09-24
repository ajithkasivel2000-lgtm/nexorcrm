/**
 * The pages permissions can be granted on.
 *
 * One list, served to the UI, so the permission screen and the enforcement can
 * never drift apart — the last version kept this in a React file, which is how
 * the matrix ended up offering pages that did not exist and hiding pages that
 * did.
 *
 * Every entry must be a page that is actually reachable in the app. If a page
 * is added to the navigation, add it here; if one is removed, remove it here,
 * or the screen will offer a switch that changes nothing.
 */

const PAGES = [
  { id: 'dashboard', label: 'Dashboard', group: 'General', actions: ['view'] },
  { id: 'leads', label: 'Leads', group: 'CRM', note: 'Also covers Campaign Leads' },
  { id: 'import-leads', label: 'Import Leads', group: 'CRM', actions: ['view', 'create'] },
  { id: 'opportunities', label: 'Opportunities', group: 'CRM' },
  { id: 'customers', label: 'Customers', group: 'CRM' },
  { id: 'report', label: 'Report', group: 'CRM', actions: ['view', 'export'] },
  { id: 'projects', label: 'Projects', group: 'Operations' },
  { id: 'channel-partners', label: 'Channel Partners', group: 'Operations' },
  { id: 'rrq', label: 'RRQ', group: 'Operations' },
  { id: 'bookings', label: 'Bookings & Payments', group: 'Operations' },
  { id: 'team-chat', label: 'Team Chat', group: 'Collaboration', actions: ['view'] },
  { id: 'assistant', label: 'AI Assistant', group: 'Collaboration', actions: ['view'] },
  { id: 'user-admin', label: 'User Admin', group: 'Administration' },
  { id: 'user-groups', label: 'User Groups', group: 'Administration' },

  /* One row per settings screen, matching the Settings menu one for one.
     These were a single 'settings' permission covering all eight, which meant
     letting somebody manage email templates also handed them the security and
     session configuration. Most carry view/edit only — a configuration screen
     has nothing to create or delete — with the two exceptions noted below. */
  { id: 'settings-registration', label: 'Registration', group: 'Settings', actions: ['view', 'edit'] },
  { id: 'settings-session', label: 'Session', group: 'Settings', actions: ['view', 'edit'] },
  { id: 'settings-lead-assignment', label: 'Lead Assignment', group: 'Settings', actions: ['view', 'edit'] },
  { id: 'settings-user', label: 'User Settings', group: 'Settings', actions: ['view', 'edit'] },
  { id: 'settings-security', label: 'Security', group: 'Settings', actions: ['view', 'edit'] },
  // A log is read and taken away, never edited.
  { id: 'settings-logs', label: 'Logs', group: 'Settings', actions: ['view', 'export'] },
  { id: 'settings-mail', label: 'Mail Settings', group: 'Settings', actions: ['view', 'edit'] },
  // Templates are records in their own right: they are added and removed.
  { id: 'settings-integrations', label: 'Integrations', group: 'Settings', actions: ['view', 'edit'] },
  { id: 'settings-email-templates', label: 'Email Templates', group: 'Settings', actions: ['view', 'create', 'edit', 'delete'] },
];

/**
 * Permissions that replaced the old single 'settings' row.
 *
 * Anyone holding `settings` before the split is given all eight, so nobody
 * loses access at the moment of upgrading. Used by the migration script and by
 * the resolver, which still honours a legacy row.
 */
const SETTINGS_PAGES = PAGES.filter((p) => p.id.startsWith('settings-')).map((p) => p.id);

/** Every action a page can carry, and the default set when one is unstated. */
const ALL_ACTIONS = ['view', 'create', 'edit', 'delete', 'export'];

/** The actions that apply to a given page — some pages cannot be exported. */
const actionsFor = (pageId) => {
  const page = PAGES.find((p) => p.id === pageId);
  return page?.actions || ALL_ACTIONS;
};

const isPage = (pageId) => PAGES.some((p) => p.id === pageId);

/** Grouped for rendering, in the order the groups appear above. */
function groupedPages() {
  const groups = [];
  for (const page of PAGES) {
    let group = groups.find((g) => g.name === page.group);
    if (!group) { group = { name: page.group, pages: [] }; groups.push(group); }
    group.pages.push({ ...page, actions: actionsFor(page.id) });
  }
  return groups;
}

module.exports = { PAGES, SETTINGS_PAGES, ALL_ACTIONS, actionsFor, isPage, groupedPages };
