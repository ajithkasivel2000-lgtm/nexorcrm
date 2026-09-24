import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import useListData from './Leads/useListData';
import invalidateLeadCache, { subscribeLeadCacheInvalidation } from '../utils/invalidateLeadCache';
import formatMobile from '../utils/formatMobile';
import DocumentPreview from './DocumentPreview';
import { DataTable, Page, RowActions } from '../ui';
import usePagePermissions from '../hooks/usePagePermissions';
import LeadStatusCell from './LeadStatusCell';

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
};

/**
 * The lead slice screens (site visits, duplicates, rejected, follow-ups) are the
 * same table over a different server-side status filter.
 *
 * @param {string}   status      value for the API's ?status= filter; omit for all leads
 * @param {Array}    tabs        optional [{ id, label }] shown above the table
 * @param {Function} filterRows  optional (rows, activeTabId) => rows, for client-side slices
 * @param {Array}    extraColumns  appended before the Created column
 */
export default function LeadListPage({
  title,
  subtitle,
  status,
  exportName,
  tabs,
  filterRows,
  extraColumns = [],
  emptyMessage,
  filters = ['primarySource', 'secondarySource', 'project', 'status', 'owner'],
}) {
  const navigate = useNavigate();

  const loggedInUser = localStorage.getItem('loggedInUser') || '';
  // Gated by this user's own permissions. See usePagePermissions.
  const { canEdit, canDelete, canExport } = usePagePermissions('leads');

  const [activeTab, setActiveTab] = useState(tabs?.[0]?.id ?? null);
  // The lead whose document is on screen, or null.
  const [previewLead, setPreviewLead] = useState(null);

  const fetchLeadsRequest = useCallback(async () => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (loggedInUser) params.set('username', loggedInUser);
    const response = await fetch(`/api/leads?${params.toString()}`);
    if (!response.ok) throw new Error(`Failed to fetch leads (${response.status})`);
    return response.json();
  }, [status, loggedInUser]);

  const { rows: leads, loading, refresh } = useListData(fetchLeadsRequest);

  // Keep this slice in sync after creates / updates / deletes / status changes
  // made on any other lead view (main list, detail profile, other tabs, dashboard).
  useEffect(() => {
    const unsubscribe = subscribeLeadCacheInvalidation(() => refresh());
    return unsubscribe;
  }, [refresh]);



  const handleDeleteSelected = async (ids, clearSelection) => {
    if (!await window.appConfirm(`Are you sure you wish to delete ${ids.length} selected lead(s)?`)) return;
    try {
      const responses = await Promise.all(
        ids.map(id => fetch(`/api/leads/${id}`, { method: 'DELETE' }))
      );
      clearSelection();
      refresh();
      invalidateLeadCache();
      const failed = responses.filter(r => !r.ok).length;
      if (failed > 0) {
        window.appAlert(`${failed} of ${ids.length} lead(s) could not be deleted.`);
      }
    } catch (error) {
      console.error('Failed to delete leads:', error);
      window.appAlert('Could not reach the server.');
    }
  };

  const rows = useMemo(
    () => (filterRows ? filterRows(leads, activeTab) : leads),
    [leads, filterRows, activeTab]
  );

  /* Each tab shows how many rows it holds, using the same predicate that
     produces the table body so the badge can never disagree with the list. */
  const tabsWithCounts = useMemo(() => (
    tabs?.map(tab => ({
      ...tab,
      count: filterRows ? filterRows(leads, tab.id).length : leads.length,
    }))
  ), [tabs, leads, filterRows]);

  const columns = useMemo(() => ([
    {
      key: 'name',
      label: 'Leads Name',
      render: r => <span className="nx-page__strong">{r.name || 'Unknown'}</span>,
    },
    {
      key: 'mobile',
      label: 'Phone Number',
      width: '160px',
      render: r => formatMobile(r.phone || r.mobile),
      exportValue: r => r.phone || r.mobile || '',
    },
    { key: 'primarySource', label: 'Primary Source', width: '160px' },
    { key: 'secondarySource', label: 'Secondary Source', width: '170px' },
    { key: 'project', label: 'Project Interested', width: '180px' },
    {
      key: 'status',
      label: 'Status',
      width: '170px',
      // Editable in place: status is the field people change most often while
      // working down a list, and it used to mean opening the lead to do it.
      render: r => <LeadStatusCell lead={r} onChanged={refresh} />,
      exportValue: r => r.status || '',
    },
    {
      key: 'owner',
      label: 'Owner',
      width: '140px',
      render: r => r.ownerName || r.owner || '—',
      exportValue: r => r.ownerName || r.owner || '',
    },
    {
      key: 'callRemarks',
      label: 'Remarks',
      width: '100px',
      align: 'center',
      sortable: false,
      // Remarks can be long; show an icon with the text on hover rather than
      // letting one cell dominate the row.
      render: r => {
        const text = r.callRemarks || r.reasonDetails;
        return text
          ? <span className="nx-page__muted" title={text}><MessageSquare size={15} /></span>
          : '—';
      },
      exportValue: r => r.callRemarks || r.reasonDetails || '',
    },
    ...extraColumns,
    {
      key: 'createdAt',
      label: 'Created Date',
      width: '190px',
      render: r => formatDateTime(r.createdAt),
      exportValue: r => formatDateTime(r.createdAt),
    },
  ]), [extraColumns, refresh]);

  return (
    <Page title={title} subtitle={subtitle}>
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        selectable
        exportName={canExport ? exportName : undefined}
        filters={filters}
        tabsFrom={tabs ? undefined : 'status'}
        tabs={tabsWithCounts}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        searchPlaceholder="Search name, phone, project or owner..."
        emptyMessage={emptyMessage || 'No leads found'}
        onRowClick={row => navigate(`/leads/${row.id}`)}
        /* Each action is wired only when it is permitted. RowActions already
           renders nothing for a handler it was not given, and DataTable hides
           "Delete Selected" without onDeleteSelected — so withholding the
           callback is all that is needed to remove the control. */
        onDeleteSelected={canDelete ? handleDeleteSelected : undefined}
        actions={row => (
          <RowActions
            label={row.name || 'lead'}
            // View shows the full Leads as a document. Downloading is a
            // button inside the preview, so glancing at a record no longer
            // leaves a file on disk. The row itself still opens the profile.
            onView={() => setPreviewLead(row)}
            onEdit={canEdit ? () => navigate(`/leads/${row.id}?edit=1`) : undefined}
            onLog={() => navigate(`/leads/${row.id}?addLog=1`)}
          />
        )}
      />

      {/* The Leads document, shown rather than saved. */}
      <DocumentPreview lead={previewLead} onClose={() => setPreviewLead(null)} />
    </Page>
  );
}
