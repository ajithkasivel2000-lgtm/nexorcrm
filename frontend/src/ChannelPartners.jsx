import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useListData } from './components/Leads';
import invalidateLeadCache, { subscribeLeadCacheInvalidation } from './utils/invalidateLeadCache';
import { Button, DataTable, Page, Pill, RowActions, toneForStatus } from './ui';
import usePagePermissions from './hooks/usePagePermissions';

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
};

export default function ChannelPartners() {
  const navigate = useNavigate();
  // Gated by this user's own permissions. See usePagePermissions.
  const { canCreate, canEdit, canDelete, canExport } = usePagePermissions('channel-partners');

  const fetchPartnersRequest = useCallback(async () => {
    const response = await fetch('/api/channel-partners');
    if (!response.ok) throw new Error(`Failed to fetch channel partners (${response.status})`);
    return response.json();
  }, []);

  const { rows: partners, loading, refresh: fetchPartners } = useListData(fetchPartnersRequest);

  // Keep this list in sync after channel-partner mutations made on the create/
  // edit pages as well as after deletions here.
  useEffect(() => {
    const unsubscribe = subscribeLeadCacheInvalidation(() => fetchPartners());
    return unsubscribe;
  }, [fetchPartners]);



  const handleDeleteSelected = async (ids, clearSelection) => {
    if (!await window.appConfirm(`Are you sure you wish to delete ${ids.length} selected Channel Partner(s)?`)) return;
    try {
      const responses = await Promise.all(
        ids.map(id => fetch(`/api/channel-partners/${id}`, { method: 'DELETE' }))
      );
      clearSelection();
      fetchPartners();
      invalidateLeadCache();
      const failed = responses.filter(r => !r.ok).length;
      if (failed > 0) {
        window.appAlert(`${failed} of ${ids.length} channel partner(s) could not be deleted.`);
      }
    } catch (error) {
      console.error('Failed to delete channel partners:', error);
      window.appAlert('Could not reach the server.');
    }
  };

  // Newest activity first. DataTable keeps this order until the viewer sorts.
  const sortedPartners = useMemo(() => (
    [...partners].sort((a, b) => {
      const aDate = new Date(a.updatedAt || a.createdAt).getTime();
      const bDate = new Date(b.updatedAt || b.createdAt).getTime();
      return bDate - aDate;
    })
  ), [partners]);

  const columns = useMemo(() => ([
    {
      key: 'cpId',
      label: 'CP ID',
      width: '150px',
      render: r => <span className="nx-page__id">{r.cpId || '—'}</span>,
    },
    {
      key: 'companyName',
      label: 'Company Name',
      render: r => <span className="nx-page__strong">{r.companyName || '—'}</span>,
    },
    { key: 'ownerName', label: "Partner's Name", render: r => r.ownerName || '—' },
    {
      key: 'mobileNumber',
      label: 'Mobile',
      width: '140px',
      render: r => <span className="nx-page__muted">{r.mobileNumber || '—'}</span>,
    },
    {
      key: 'emailAddress',
      label: 'Email Address',
      render: r => <span className="nx-page__muted">{r.emailAddress || '—'}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      width: '130px',
      render: r => (r.status
        ? <Pill tone={toneForStatus(r.status)} dot>{r.status}</Pill>
        : '—'),
    },
    {
      key: 'createdAt',
      label: 'Created Date',
      width: '190px',
      render: r => formatDateTime(r.createdAt),
      exportValue: r => formatDateTime(r.createdAt),
    },
  ]), []);

  return (
    <Page
      title="Channel Partners"
      subtitle="Create, view and edit Channel Partners. Assign users to Lead List"
      actions={canCreate ? (
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => navigate('/channel-partners/create')}
        >
          Create Channel Partner
        </Button>
      ) : null}
    >
      <DataTable
        columns={columns}
        rows={sortedPartners}
        loading={loading}
        selectable
        // Export stays behind the same page permission it always did.
        exportName={canExport ? 'channel-partners' : undefined}
        filters={['status']}
        tabsFrom="status"
        searchPlaceholder="Search company, partner or mobile..."
        emptyMessage="No channel partners yet"
        emptyHint="Create your first channel partner to get started."
        onRowClick={row => navigate(`/channel-partners/edit/${row.id}`)}
        onDeleteSelected={canDelete ? handleDeleteSelected : undefined}
        actions={row => (
          <RowActions
            label={row.companyName || row.cpId || 'partner'}
            onEdit={canEdit ? () => navigate(`/channel-partners/edit/${row.id}`) : undefined}
          />
        )}
      />
    </Page>
  );
}
