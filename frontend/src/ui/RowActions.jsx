import { Eye, SquarePen } from 'lucide-react';
import Button from './Button';

/**
 * The standard row actions: View, Edit, Log.
 *
 * Delete is deliberately absent — deleting happens by ticking rows and using
 * "Delete Selected" in the toolbar, so a destructive action can't be one
 * mis-click away from an edit.
 *
 * Only the actions you wire up are rendered, because not every screen has a
 * detail view or an activity log to open.
 *
 * @param {string} label  the row's name, used to build distinct aria-labels
 */
export default function RowActions({ onView, onEdit, label = 'record' }) {
  return (
    <div className="nx-row-actions">
      {onView && (
        <Button
          variant="ghost" size="sm" icon={Eye}
          aria-label={`View ${label}`} title="View"
          onClick={onView}
        />
      )}
      {onEdit && (
        <Button
          variant="ghost" size="sm" icon={SquarePen}
          aria-label={`Edit ${label}`} title="Edit"
          onClick={onEdit}
        />
      )}
    </div>
  );
}
