import { useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './Report.css';
import formatMobile from './utils/formatMobile';
import useLiveRefresh from './utils/useLiveRefresh';
import DocumentPreview from './components/DocumentPreview';
import { Button, DataTable, Modal, Page, Pill, RowActions, Select, toneForStatus } from './ui';

const formatReportDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
};

export default function Report() {

  const navigate = useNavigate();

  const [leads, setLeads] = useState([]);
  const [remarksModalLeadId, setRemarksModalLeadId] = useState(null);
  // The lead whose document is on screen, or null.
  const [previewLead, setPreviewLead] = useState(null);

  // Filters
  const [reportType, setReportType] = useState('Today');
  const [statusFilter, setStatusFilter] = useState('');
  const [primarySources, setPrimarySources] = useState({
    'Channel Partner': false,
    'Direct Walk In': false,
    'Outdoor Marketing': false,
    'Digital Marketing': false
  });
  // Live filters

  useEffect(() => {
    fetchLeads();
  }, []);

  /* A report read while leads are being worked on was showing the figures as
     they stood when the page opened. */
  useLiveRefresh(['leads'], () => { fetchLeads(); });

  const fetchLeads = async () => {
    try {
      const loggedInUser = localStorage.getItem('loggedInUser') || '';
      const response = await fetch(`/api/leads?username=${loggedInUser}`);
      if (response.ok) {
        const data = await response.json();
        setLeads(data);
      }
    } catch (error) {
      console.error('Failed to fetch leads for report:', error);
    }
  };



  const handleSourceChange = (source) => {
    setPrimarySources(prev => ({
      ...prev,
      [source]: !prev[source]
    }));
  };



  // Compute Active Filters
  const activeSources = Object.keys(primarySources).filter(k => primarySources[k]);

  let filteredLeads = leads.filter(lead => {
    // Status filter
    const matchesStatus = !statusFilter || lead.status === statusFilter;

    // Checkbox filter
    const matchesSource = activeSources.length === 0 ||
      (lead.primarySource && activeSources.some(source => source.toLowerCase() === lead.primarySource.toLowerCase()));

    // Report Type (date range) filter
    let matchesDate = true;
    if (lead.createdAt) {
      const leadDate = new Date(lead.createdAt);
      const now = new Date();
      if (reportType === 'Today') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        matchesDate = leadDate >= startOfToday && leadDate < endOfToday;
      } else if (reportType === 'Yesterday') {
        const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        matchesDate = leadDate >= startOfYesterday && leadDate < endOfYesterday;
      } else if (reportType === 'This Week') {
        const day = now.getDay();
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
        const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - day));
        matchesDate = leadDate >= startOfWeek && leadDate < endOfWeek;
      } else if (reportType === 'This Month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        matchesDate = leadDate >= startOfMonth && leadDate < endOfMonth;
      }
    }

    return matchesStatus && matchesSource && matchesDate;
  });



  const reportColumns = [
    {
      key: 'name',
      label: 'Leads Name',
      render: l => <span className="nx-page__strong">{l.name || '—'}</span>,
    },
    {
      key: 'mobile',
      label: 'Phone Number',
      width: '160px',
      render: l => formatMobile(l.mobile),
      exportValue: l => l.mobile || '',
    },
    { key: 'primarySource', label: 'Primary Source', width: '170px' },
    {
      key: 'status',
      label: 'Status',
      width: '150px',
      render: l => (l.status ? <Pill tone={toneForStatus(l.status)} dot>{l.status}</Pill> : '—'),
      exportValue: l => l.status || '',
    },
    {
      key: 'owner',
      label: 'Owner',
      width: '150px',
      render: l => l.ownerName || l.owner || '—',
      exportValue: l => l.ownerName || l.owner || '',
    },
    {
      key: 'callRemarks',
      label: 'Remarks',
      width: '100px',
      align: 'center',
      sortable: false,
      render: l => (
        <Button
          variant="ghost" size="sm" icon={MessageSquare}
          aria-label={`Call remarks for ${l.name || 'lead'}`}
          onClick={() => setRemarksModalLeadId(l.id)}
        />
      ),
      exportValue: l => l.callRemarks || '',
    },
    {
      key: 'updatedAt',
      label: 'Last update',
      width: '190px',
      render: l => formatReportDate(l.updatedAt),
      exportValue: l => formatReportDate(l.updatedAt),
    },
    {
      key: 'createdAt',
      label: 'Created Date',
      width: '190px',
      render: l => formatReportDate(l.createdAt),
      exportValue: l => formatReportDate(l.createdAt),
    },
  ];

  return (
    <Page title="Export Report">
      <div className="report-card">

        {/* Filters Section */}
        <div className="report-filters-section">
          <div className="filter-row">
            <span className="filter-label">Report Type:</span>
            <div className="filter-input-group">
              <Select
                advanceOnPick={false}
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              >
                <option value="Today">Today</option>
                <option value="Yesterday">Yesterday</option>
                <option value="This Week">This Week</option>
                <option value="This Month">This Month</option>
              </Select>
            </div>
          </div>

          <div className="filter-row">
            <span className="filter-label">Primary Source:</span>
            <div className="filter-input-group checkbox-group">
              {Object.keys(primarySources).map(source => (
                <label key={source} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={primarySources[source]}
                    onChange={() => handleSourceChange(source)}
                  />
                  {source}
                </label>
              ))}
            </div>
          </div>

          <div className="filter-row">
            <span className="filter-label">Status:</span>
            <div className="filter-input-group">
              <Select
                advanceOnPick={false}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="New Lead">New Lead</option>
                <option value="Attempted">Attempted</option>
                <option value="Interested">Interested</option>
                <option value="Duplicate">Duplicate</option>
                <option value="Rejected">Rejected</option>
                <option value="Site Visit">Site Visit</option>
              </Select>
            </div>
          </div>

        </div>


        <DataTable
          columns={reportColumns}
          rows={filteredLeads}
          exportName="lead-report"
          filters={['primarySource', 'status', 'owner']}
          tabsFrom="status"
          persistKey="report"
          searchPlaceholder="Search name, phone, source or owner..."
          emptyMessage="No data available"
          emptyHint="Adjust the report filters above to see results."
          actions={lead => (
            <RowActions
              label={lead.name || 'lead'}
              // View shows the full Leads as a document; downloading is a
              // button inside the preview.
              onView={() => setPreviewLead(lead)}
              onEdit={() => navigate(`/leads/${lead.id}?edit=1`)}
              onLog={() => setRemarksModalLeadId(lead.id)}
            />
          )}
        />


      </div>
      {/* View Remarks / Lead Logs Modal */}
      <Modal
        open={!!remarksModalLeadId}
        onClose={() => setRemarksModalLeadId(null)}
        size="sm"
        title="Lead Logs"
      >
        {(() => {
          const lead = leads.find(l => l.id === remarksModalLeadId);
          const logs = lead?.logs ? [...lead.logs].sort((a, b) => new Date(b.date) - new Date(a.date)) : [];
          if (logs.length === 0) {
            return <p className="nx-page__muted">No logs available.</p>;
          }
          const log = logs[0];
          return (
            <div className="nx-opp-log">
              <p className="nx-opp-log__title">{log.title}</p>
              {log.subtitle && (
                <p className="nx-opp-log__subtitle">{log.subtitle.replace('by admin ', '')}</p>
              )}
              <p className="nx-opp-log__date">on {formatReportDate(log.date)}</p>
            </div>
          );
        })()}
      </Modal>

      {/* The Leads document, shown rather than saved. */}
      <DocumentPreview lead={previewLead} onClose={() => setPreviewLead(null)} />
    </Page>
  );
}
