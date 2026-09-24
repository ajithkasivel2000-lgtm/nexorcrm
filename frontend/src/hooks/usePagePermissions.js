import { useOutletContext } from 'react-router-dom';

/**
 * What the signed-in user may do on one page.
 *
 * Reads the permissions the Dashboard fetched once from
 * /api/user-permissions/me, so every screen gates from the same answer the
 * server enforces.
 *
 * The default is ALLOW, in two cases that matter:
 *
 *   - the user has no permissions configured at all (`restricted: false`)
 *   - the permissions have not loaded yet, or the request failed
 *
 * Denying in either case would blank the application for everyone the moment
 * this shipped, or flash every button off on a slow network. A user who really
 * should be restricted has rows, and those rows are what close a page.
 *
 * @param {string} pageId  'leads', 'projects', 'rrq', …
 */
export default function usePagePermissions(pageId) {
  const context = useOutletContext();
  const perms = context?.permissions;

  const ALLOW = {
    canView: true, canCreate: true, canEdit: true, canDelete: true, canExport: true,
  };

  // Not loaded, super admin, or nothing configured for this person.
  if (!perms || perms.superAdmin || !perms.restricted) return ALLOW;

  const row = Array.isArray(perms.permissions)
    ? perms.permissions.find((p) => p.page === pageId)
    : null;

  // Restricted, and this page has no row: closed.
  if (!row) {
    return {
      canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false,
    };
  }

  return {
    canView: Boolean(row.view),
    canCreate: Boolean(row.create),
    canEdit: Boolean(row.edit),
    canDelete: Boolean(row.delete),
    canExport: Boolean(row.export),
  };
}
