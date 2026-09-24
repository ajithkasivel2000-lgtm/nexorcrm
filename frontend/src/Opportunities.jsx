import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useListData } from './components/Leads';
import formatMobile from './utils/formatMobile';
import { DataTable, Modal, Page, Pill, RowActions, toneForStatus } from './ui';
import usePagePermissions from './hooks/usePagePermissions';
import invalidateLeadCache from './utils/invalidateLeadCache';

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
};

export default function Opportunities() {
  const navigate = useNavigate();

  const loggedInUser = localStorage.getItem('loggedInUser') || '';
  // Gated by this user's own permissions. See usePagePermissions.
  const { canEdit, canDelete, canExport } = usePagePermissions('opportunities');

  const [selectedOppForLogs, setSelectedOppForLogs] = useState(null);

  const fetchOpportunitiesRequest = useCallback(async () => {
    const response = await fetch(`/api/opportunities?username=${encodeURIComponent(loggedInUser)}`);
    if (!response.ok) throw new Error(`Failed to fetch opportunities (${response.status})`);
    return response.json();
  }, [loggedInUser]);

  const { rows: opportunities, loading, refresh } = useListData(fetchOpportunitiesRequest);

  /**
   * Deletes the selected opportunities.
   *
   * The confirmation lists what is about to go rather than only counting it.
   * "Delete 20 opportunities?" reads identically whether it is a deliberate
   * clear-out or a select-all nobody meant to click.
   */
  const handleDeleteSelected = async (ids, clearSelection) => {
    const chosen = opportunities.filter((o) => ids.includes(o.id));
    const names = chosen.slice(0, 5).map((o) => o.opportunityName || o.oppId || o.id);
    const rest = chosen.length - names.length;

    const summary = [
      `Permanently delete ${ids.length} opportunit${ids.length === 1 ? 'y' : 'ies'}?`,
      '',
      names.join('\n'),
      rest > 0 ? `…and ${rest} more` : '',
      '',
      'This cannot be undone.',
    ].filter((line, i) => line !== '' || i > 0).join('\n');

    if (!await window.appConfirm(summary)) return;

    try {
      const responses = await Promise.all(
        ids.map((id) => fetch(`/api/opportunities/${id}`, { method: 'DELETE' })),
      );
      clearSelection();
      refresh();
      invalidateLeadCache();

      // The API refuses a non-superadmin even though the button is hidden,
      // so a 403 here means the two disagree and is worth saying plainly.
      const refused = responses.filter((r) => r.status === 403).length;
      const failed = responses.filter((r) => !r.ok).length;
      if (refused > 0) {
        window.appAlert('Only the super admin can delete opportunities.');
      } else if (failed > 0) {
        window.appAlert(`${failed} of ${ids.length} could not be deleted.`);
      }
    } catch (error) {
      console.error('Error deleting opportunities:', error);
      window.appAlert('Could not reach the server.');
    }
  };

  const handleOpenLogs = async (id) => {
    try {
      const response = await fetch(`/api/opportunities/${id}`);
      if (!response.ok) {
        window.appAlert('Could not load the log for this opportunity.');
        return;
      }
      setSelectedOppForLogs(await response.json());
    } catch (error) {
      console.error('Failed to fetch opportunity logs:', error);
      window.appAlert('Could not reach the server.');
    }
  };

  // Newest activity first. DataTable keeps this order until the viewer sorts.
  const sortedOpportunities = useMemo(() => (
    [...opportunities].sort((a, b) => {
      const aDate = new Date(a.updatedAt || a.createdAt).getTime();
      const bDate = new Date(b.updatedAt || b.createdAt).getTime();
      return bDate - aDate;
    })
  ), [opportunities]);

  const columns = useMemo(() => ([
    {
      key: 'oppId',
      label: 'OPP Id',
      width: '170px',
      render: r => <span className="nx-page__id">{r.oppId || '—'}</span>,
    },
    {
      key: 'opportunityName',
      label: 'OPP Name',
      render: r => <span className="nx-page__strong">{r.opportunityName || '—'}</span>,
    },
    {
      key: 'mobileNumber',
      label: 'Mobile',
      width: '160px',
      render: r => formatMobile(r.mobileNumber),
      exportValue: r => r.mobileNumber || '',
    },
    { key: 'LeadsProject', label: 'Project', width: '180px' },
    {
      key: 'stage',
      label: 'Status',
      width: '150px',
      render: r => (r.stage ? <Pill tone={toneForStatus(r.stage)} dot>{r.stage}</Pill> : '—'),
    },
    { key: 'opportunityOwner', label: 'Owner', width: '150px' },
    {
      key: 'createdAt',
      label: 'Created Date',
      width: '190px',
      render: r => formatDateTime(r.createdAt),
      exportValue: r => formatDateTime(r.createdAt),
    },
    {
      key: 'updatedAt',
      label: 'Updated Date',
      width: '190px',
      render: r => formatDateTime(r.updatedAt || r.createdAt),
      exportValue: r => formatDateTime(r.updatedAt || r.createdAt),
    },
  ]), []);

  const log = selectedOppForLogs?.logs?.[0];

  return (
    <Page
      title="Opportunities"
      subtitle="Leads that have converted into active opportunities."
    >
      <DataTable
        columns={columns}
        rows={sortedOpportunities}
        loading={loading}
        exportName={canExport ? 'opportunities' : undefined}
        filters={['stage', 'LeadsProject', 'opportunityOwner']}
        tabsFrom="stage"
        searchPlaceholder="Search id, name, mobile or project..."
        emptyMessage="No opportunities yet"
        emptyHint="Opportunities appear here once a lead is converted."
        onDeleteSelected={canDelete ? handleDeleteSelected : undefined}
        onRowClick={row => navigate(`/opportunities/${row.id}`)}
        actions={row => (
          <RowActions
            label={row.opportunityName || row.oppId || 'opportunity'}
            onView={() => navigate(`/opportunities/${row.id}`)}
            onEdit={canEdit ? () => navigate(`/opportunities/${row.id}`) : undefined}
            onLog={() => handleOpenLogs(row.id)}
          />
        )}
      />

      <Modal
        open={!!selectedOppForLogs}
        onClose={() => setSelectedOppForLogs(null)}
        size="sm"
        title={selectedOppForLogs ? `Log for ${selectedOppForLogs.oppId}` : 'Log'}
      >
        {selectedOppForLogs && (
          <div className="nx-opp-log">
            <p className="nx-opp-log__title">{log?.title || 'Lead To Opportunity'}</p>
            {log?.subtitle && (
              <p className="nx-opp-log__subtitle">{log.subtitle.replace('by admin ', '')}</p>
            )}
            <p className="nx-opp-log__date">
              on {formatDateTime(log?.date || selectedOppForLogs.createdAt)}
            </p>
          </div>
        )}
      </Modal>
    </Page>
  );
}
