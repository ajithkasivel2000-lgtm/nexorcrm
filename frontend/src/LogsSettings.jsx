import { useCallback, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { useListData } from './components/Leads';
import formatIp from './utils/formatIp';
import { Button, DataTable, Page, Pill } from './ui';

const formatDate = (isoString) => {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return `${dateStr}, ${timeStr}`;
};

// LOGIN / LOGOFF are the two events the backend records today; anything else
// falls back to neutral rather than being mis-coloured.
const toneForEvent = (event) => {
  const e = String(event || '').toUpperCase();
  if (e === 'LOGIN') return 'success';
  if (e === 'LOGOFF' || e === 'LOGOUT') return 'neutral';
  return 'info';
};

const LogsSettings = () => {
  const fetchLogsRequest = useCallback(async () => {
    const response = await fetch('/api/logs');
    if (!response.ok) throw new Error(`Failed to fetch logs (${response.status})`);
    return response.json();
  }, []);

  const { rows: logs, loading, refresh } = useListData(fetchLogsRequest);

  const purge = async (url, confirmText, failText) => {
    if (!await window.appConfirm(confirmText)) return;
    try {
      const response = await fetch(url, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        window.appAlert(data.message || failText);
        return;
      }
      refresh();
    } catch (error) {
      console.error(failText, error);
      window.appAlert('Could not reach the server.');
    }
  };

  const columns = useMemo(() => ([
    {
      key: 'username',
      label: 'Username',
      width: '200px',
      render: l => <span className="nx-page__strong">{l.username || '—'}</span>,
    },
    {
      key: 'event',
      label: 'Event',
      width: '150px',
      render: l => (l.event ? <Pill tone={toneForEvent(l.event)} dot>{l.event}</Pill> : '—'),
    },
    {
      key: 'createdAt',
      label: 'Date / Time',
      width: '230px',
      render: l => formatDate(l.createdAt),
      exportValue: l => formatDate(l.createdAt),
    },
    {
      key: 'ipAddress',
      label: 'IP Address',
      render: l => <span className="nx-page__id">{formatIp(l.ipAddress)}</span>,
    },
  ]), []);

  return (
    <Page
      title="Logs"
      subtitle="Sign-in activity recorded across the system."
      actions={
        <>
          <Button
            icon={Trash2}
            onClick={() => purge(
              '/api/logs/old',
              'Are you sure you want to delete logs older than 30 days?',
              'Failed to delete old logs.'
            )}
          >
            Delete logs older than 30 days
          </Button>
          <Button
            variant="danger"
            icon={Trash2}
            onClick={() => purge(
              '/api/logs/all',
              'Are you sure you want to delete all logs? This cannot be undone.',
              'Failed to delete all logs.'
            )}
          >
            Delete all logs
          </Button>
        </>
      }
    >
      <DataTable
        columns={columns}
        rows={logs}
        loading={loading}
        exportName="system-logs"
        filters={['event', 'username']}
        tabsFrom="event"
        searchPlaceholder="Search username, event or IP..."
        emptyMessage="No logs found"
        emptyHint="Sign-in and sign-out events will appear here."
      />
    </Page>
  );
};

export default LogsSettings;
