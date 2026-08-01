import { useState, useEffect } from 'react';
import { Home, Edit, Trash2, ArrowUpDown, MessageSquare, X } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import './Report.css';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export default function Report() {
  const navigate = useNavigate();
  const context = useOutletContext();
  const loggedInUser = localStorage.getItem('loggedInUser') || '';
  const pagePerm = context?.permissionsList?.find(p => p.page === 'report');
  const hasExportPermission = loggedInUser === 'admin' ? true : (pagePerm ? !!pagePerm.export : true);

  const [leads, setLeads] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [remarksModalLeadId, setRemarksModalLeadId] = useState(null);
  
  // Filters
  const [reportType, setReportType] = useState('Today');
  const [statusFilter, setStatusFilter] = useState('');
  const [primarySources, setPrimarySources] = useState({
    'Channel Partner': false,
    'Direct Walk In': false,
    'Outdoor Marketing': false,
    'Digital Marketing': false
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState({
    reportType: 'Today',
    statusFilter: '',
    primarySources: {
      'Channel Partner': false,
      'Direct Walk In': false,
      'Outdoor Marketing': false,
      'Digital Marketing': false
    }
  });

  useEffect(() => {
    fetchLeads();
  }, []);

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

  const handleDelete = async (id, name, phone) => {
    const isConfirmed = window.confirm(`re.nexorcrm.com says\nAre you sure you wish to delete this [ ${name}-${phone} ] Leads? It will remove leads from the list.`);
    if (isConfirmed) {
      try {
        const response = await fetch(`/api/leads/${id}`, {
          method: 'DELETE'
        });
        if (response.ok) {
          // Remove from local state immediately to refresh table
          setLeads(leads.filter(lead => lead.id !== id));
        }
      } catch (error) {
        console.error('Failed to delete lead:', error);
      }
    }
  };

  const handleSourceChange = (source) => {
    setPrimarySources(prev => ({
      ...prev,
      [source]: !prev[source]
    }));
  };

  const handleSubmit = () => {
    setAppliedFilters({
      reportType,
      statusFilter,
      primarySources: { ...primarySources }
    });
    setIsSubmitted(true);
    fetchLeads();
  };

  // Compute Active Filters
  const activeSources = Object.keys(appliedFilters.primarySources).filter(k => appliedFilters.primarySources[k]);

  let filteredLeads = leads.filter(lead => {
    // Status filter
    const matchesStatus = !appliedFilters.statusFilter || lead.status === appliedFilters.statusFilter;
    
    // Text search
    const matchesSearch = 
      (lead.name && lead.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lead.mobile && lead.mobile.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // Checkbox filter
    const matchesSource = activeSources.length === 0 || 
      (lead.primarySource && activeSources.some(source => source.toLowerCase() === lead.primarySource.toLowerCase()));

    // Report Type (date range) filter
    let matchesDate = true;
    if (lead.createdAt) {
      const leadDate = new Date(lead.createdAt);
      const now = new Date();
      if (appliedFilters.reportType === 'Today') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        matchesDate = leadDate >= startOfToday && leadDate < endOfToday;
      } else if (appliedFilters.reportType === 'Yesterday') {
        const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        matchesDate = leadDate >= startOfYesterday && leadDate < endOfYesterday;
      } else if (appliedFilters.reportType === 'This Week') {
        const day = now.getDay();
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
        const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - day));
        matchesDate = leadDate >= startOfWeek && leadDate < endOfWeek;
      } else if (appliedFilters.reportType === 'This Month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        matchesDate = leadDate >= startOfMonth && leadDate < endOfMonth;
      }
    }

    return matchesStatus && matchesSearch && matchesSource && matchesDate;
  });

  // Export functions
  const exportCSV = () => {
    const headers = ["ID", "Enquiry Name", "Phone Number", "Primary Source", "Status", "Owner", "Last update", "Created Date"];
    const rows = filteredLeads.map((lead, index) => [
      index + 1,
      lead.name || "",
      lead.mobile || "",
      lead.primarySource || "",
      lead.status || "",        lead.ownerName || lead.owner || "",
      new Date(lead.updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }).replace(/,/g, ""),
      new Date(lead.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }).replace(/,/g, "")
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(
      filteredLeads.map((lead, index) => ({
        "ID": index + 1,
        "Enquiry Name": lead.name || "",
        "Phone Number": lead.mobile || "",
        "Primary Source": lead.primarySource || "",
        "Status": lead.status || "",
        "Owner": lead.ownerName || lead.owner || "",
        "Last update": new Date(lead.updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        "Created Date": new Date(lead.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      }))
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    XLSX.writeFile(workbook, "report.xlsx");
  };

  const exportPDF = () => {
    const doc = new jsPDF('landscape');
    doc.text("Export Report", 14, 15);
    const tableColumn = ["ID", "Enquiry Name", "Phone No", "Primary Source", "Status", "Owner", "Last update", "Created Date"];
    const tableRows = [];
    filteredLeads.forEach((lead, index) => {
      tableRows.push([
        index + 1,
        lead.name || "-",
        lead.mobile || "-",
        lead.primarySource || "-",
        lead.status || "-",
        lead.ownerName || lead.owner || "-",
        new Date(lead.updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        new Date(lead.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      ]);
    });
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });
    doc.save(`report_${Date.now()}.pdf`);
  };

  return (
    <div className="report-page">
      <div className="report-header">
        <h2>Export Report</h2>
        <div className="page-breadcrumb">
          <Home size={14} style={{cursor: 'pointer'}} onClick={() => navigate('/')} /> <span className="slash">/</span> <span className="current">Report</span>
        </div>
      </div>

      <div className="report-card">
        
        {/* Filters Section */}
        <div className="report-filters-section">
          <div className="filter-row">
            <span className="filter-label">Report Type:</span>
            <div className="filter-input-group">
              <select 
                className="filter-select" 
                value={reportType} 
                onChange={(e) => setReportType(e.target.value)}
              >
                <option value="Today">Today</option>
                <option value="Yesterday">Yesterday</option>
                <option value="This Week">This Week</option>
                <option value="This Month">This Month</option>
              </select>
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
              <select
                className="filter-select"
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
              </select>
            </div>
          </div>

          <div className="submit-btn-row">
            <button className="btn-submit" onClick={handleSubmit}>Submit</button>
          </div>
        </div>

        {isSubmitted && (
          <>
            {/* Toolbar & Search */}
            <div className="report-toolbar">
              {hasExportPermission && (
                <div className="toolbar-left">
                  <button className="btn-export excel" onClick={exportExcel}>Excel</button>
                  <button className="btn-export csv" onClick={exportCSV}>CSV</button>
                  <button className="btn-export pdf" onClick={exportPDF}>PDF</button>
                </div>
              )}
              <div className="toolbar-right">
                <label className="search-label">Search:</label>
                <input 
                  type="text" 
                  className="search-input" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Table */}
            <div className="report-table-wrapper">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Enquiry Name <ArrowUpDown size={12} className="table-arrows" /></th>
                    <th>Phone Number <ArrowUpDown size={12} className="table-arrows" /></th>
                    <th>Primary Source <ArrowUpDown size={12} className="table-arrows" /></th>
                    <th>Status <ArrowUpDown size={12} className="table-arrows" /></th>
                    <th>Owner <ArrowUpDown size={12} className="table-arrows" /></th>
                    <th>Call Remarks <ArrowUpDown size={12} className="table-arrows" /></th>
                    <th>Last update <ArrowUpDown size={12} className="table-arrows" /></th>
                    <th>Created Date <ArrowUpDown size={12} className="table-arrows" /></th>
                    <th>Actions <ArrowUpDown size={12} className="table-arrows" /></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.length > 0 ? (
                    filteredLeads.map((lead, index) => (
                      <tr key={lead.id}>
                        <td>{index + 1}</td>
                        <td style={{color: '#7b68ee'}}>{lead.name}</td>
                        <td>{lead.mobile}</td>
                        <td>{lead.primarySource || '-'}</td>
                        <td>{lead.status}</td>
                        <td>{lead.ownerName || lead.owner}</td>
                        <td>
                           <button onClick={() => setRemarksModalLeadId(lead.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                             <span className="call-remarks-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8c6cf5', border: '1px solid #8c6cf5', borderRadius: '4px', padding: '4px' }}><MessageSquare size={14} /></span>
                           </button>
                        </td>
                        <td>{new Date(lead.updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                        <td>{new Date(lead.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                        <td className="rl-actions-cell">
                          <button 
                            className="rl-action-btn rl-edit-btn" 
                            onClick={() => navigate(`/leads/${lead.id}`)}
                          >
                            <Edit size={14} />
                          </button>
                          <button 
                            className="rl-action-btn rl-delete-btn" 
                            onClick={() => handleDelete(lead.id, lead.name, lead.mobile)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="10" className="text-center">No data available in table</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="report-footer">
              <div className="showing-entries">
                Showing {filteredLeads.length > 0 ? 1 : 0} to {filteredLeads.length} of {filteredLeads.length} entries
              </div>
              <div className="pagination">
                <button className="page-btn disabled">Previous</button>
                {filteredLeads.length > 0 ? <button className="page-btn active">1</button> : null}
                <button className="page-btn disabled">Next</button>
              </div>
            </div>
          </>
        )}

      </div>
      {/* View Remarks / Lead Logs Modal */}
      {remarksModalLeadId && (
        <div className="modal-overlay" style={{ position: 'fixed', zIndex: 9999, top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setRemarksModalLeadId(null)}>
          <div className="status-modal-content" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: '#fff', padding: '0', borderRadius: '8px', width: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="status-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid #eee' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#333' }}>Lead Logs</h3>
              <button className="modal-close" onClick={() => setRemarksModalLeadId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <div className="status-modal-body" style={{ padding: '20px', overflowY: 'auto' }}>
              <div className="log-list">
                {(() => {
                  const lead = leads.find(l => l.id === remarksModalLeadId);
                  const logs = lead?.logs ? [...lead.logs].sort((a, b) => new Date(b.date) - new Date(a.date)) : [];
                  if (logs.length === 0) return <div style={{ color: '#888' }}>No logs available.</div>;
                  const log = logs[0];
                  return (
                    <div className="log-item" key={log.id || 0} style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                      <div className="log-avatar-img" style={{ width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#f0ecfc' }}>
                        <img src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${log.title}&backgroundColor=f0ecfc`} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div className="log-content">
                        <p style={{ margin: '0 0 5px 0', fontSize: '14px', fontWeight: '600', color: '#333' }}>{log.title}</p>
                        <span style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px' }}>{log.subtitle ? log.subtitle.replace('by admin ', '') : ''}</span>
                        <span className="log-date" style={{ fontSize: '12px', color: '#999' }}>
                          on {new Date(log.date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
