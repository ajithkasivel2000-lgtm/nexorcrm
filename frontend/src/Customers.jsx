import { useCallback, useMemo } from 'react';
import { useListData } from './components/Leads';
import { DataTable, Page, Pill, toneForStatus } from './ui';
import usePagePermissions from './hooks/usePagePermissions';

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
};

export default function Customers() {
  /* Read-only screen: customers are created by converting a lead, and there
     is no customer detail page, so export is the only gated action here. */
  const { canExport } = usePagePermissions('customers');

  const fetchCustomers = useCallback(async () => {
    const response = await fetch('/api/customers');
    if (!response.ok) throw new Error(`Failed to fetch customers (${response.status})`);
    return response.json();
  }, []);

  const { rows: customers, loading } = useListData(fetchCustomers);

  // Newest activity first. DataTable keeps this order until the viewer sorts.
  const sortedCustomers = useMemo(() => (
    [...customers].sort((a, b) => {
      const aDate = new Date(a.updatedAt || a.createdAt).getTime();
      const bDate = new Date(b.updatedAt || b.createdAt).getTime();
      return bDate - aDate;
    })
  ), [customers]);

  const columns = useMemo(() => ([
    {
      key: 'customerId',
      label: 'Customer Id',
      width: '170px',
      render: r => <span className="nx-page__id">{r.customerId || '—'}</span>,
    },
    {
      key: 'customerName',
      label: 'Customer Name',
      render: r => <span className="nx-page__strong">{r.customerName || '—'}</span>,
    },
    {
      key: 'customerEmail',
      label: 'Email',
      render: r => <span className="nx-page__muted">{r.customerEmail || '—'}</span>,
    },
    {
      key: 'customerMobile',
      label: 'Mobile',
      width: '160px',
      render: r => <span className="nx-page__muted">{r.customerMobile || '—'}</span>,
    },
    {
      key: 'stage',
      label: 'Stage',
      width: '140px',
      render: r => (r.stage ? <Pill tone={toneForStatus(r.stage)} dot>{r.stage}</Pill> : '—'),
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
      title="Customers"
      subtitle="View and manage all customers and their current stage."
    >
      <DataTable
        columns={columns}
        rows={sortedCustomers}
        loading={loading}
        exportName={canExport ? 'customers' : undefined}
        filters={['stage']}
        tabsFrom="stage"
        searchPlaceholder="Search customer, email or mobile..."
        emptyMessage="No customers yet"
        emptyHint="Customers appear here once a lead is converted."
      />
    </Page>
  );
}
