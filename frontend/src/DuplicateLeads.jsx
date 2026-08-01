import React, { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Home, ArrowUpDown, Edit, Trash2, MessageSquare, X } from 'lucide-react';
import './DuplicateLeads.css';

export default function DuplicateLeads() {
  const [searchTerm, setSearchTerm] = useState('');
  const [leadsData, setLeadsData] = useState([]);
  const [remarksModalLeadId, setRemarksModalLeadId] = useState(null);
  const navigate = useNavigate();
  const context = useOutletContext();
  const loggedInUser = localStorage.getItem('loggedInUser') || '';
  const pagePerm = context?.permissionsList?.find(p => p.page === 'leads');
  const hasExportPermission = loggedInUser === 'admin' ? true : (pagePerm ? !!pagePerm.export : true);

  React.useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      const loggedInUser = localStorage.getItem('loggedInUser') || '';
      const response = await fetch(`/api/leads?status=Duplicate&username=${loggedInUser}`);
      if (response.ok) {
        const data = await response.json();
        setLeadsData(data);
      }
    } catch (error) {
      console.error('Failed to fetch duplicate leads:', error);
    }
  };

  const filteredData = leadsData.filter(item => {
    const itemName = item.name || '';
    const itemPhone = item.phone || item.mobile || '';
    return itemName.toLowerCase().includes(searchTerm.toLowerCase()) || 
           itemPhone.includes(searchTerm);
  });

  const handleExportCSV = () => {
    const headers = ['#', 'Enquiry Name', 'Phone Number', 'Primary Source', 'Secondary Source', 'Project Interested', 'Status', 'Owner', 'Call Remarks', 'Last update', 'Created Date'];
    const rows = filteredData.map((row, index) => [
      index + 1,
      row.name || '',
      row.phone || row.mobile || '',
      row.primarySource || '',
      row.secondarySource || '',
      row.project || '',
      row.status || '',
      row.ownerName || row.owner || '',
      row.callRemarks || '',
      new Date(row.updatedAt).toLocaleString() || '',
      new Date(row.createdAt).toLocaleString() || ''
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'duplicate_leads.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    handleExportCSV();
  };

  const handleExportPDF = () => {
    window.print();
  };

  const handleCopy = () => {
    const headers = ['#', 'Enquiry Name', 'Phone Number', 'Primary Source', 'Secondary Source', 'Project Interested', 'Status', 'Owner', 'Call Remarks', 'Last update', 'Created Date'];
    const rows = filteredData.map((row, index) => [
      index + 1,
      row.name,
      row.phone,
      row.primarySource,
      row.secondarySource,
      row.project,
      row.status,
      row.ownerName || row.owner,
      '',
      row.lastUpdate,
      row.createdDate
    ]);
    
    const textContent = [
      headers.join('\t'),
      ...rows.map(e => e.join('\t'))
    ].join('\n');

    navigator.clipboard.writeText(textContent).then(() => {
      alert('Data copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy: ', err);
    });
  };

  const handleDelete = async (lead) => {
    const leadPhone = lead.phone || lead.mobile || '';
    const confirmMessage = `Are you sure you wish to delete this [ ${lead.name}-${leadPhone} ] Leads?\nIt will remove leads from the list.`;
    if (window.confirm(confirmMessage)) {
      try {
        const response = await fetch(`/api/leads/${lead.id}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          setLeadsData(prev => prev.filter(item => item.id !== lead.id));
        }
      } catch (error) {
        console.error('Failed to delete lead:', error);
      }
    }
  };

  return (
    <div className="dl-container">
      {/* Header Block */}
      <div className="dl-header-block">
        <h1 className="dl-title">Duplicate Leads</h1>
        <div className="dl-breadcrumbs">
          <Home className="dl-home-icon" style={{cursor: 'pointer'}} onClick={() => navigate('/')} /> 
          <span className="dl-separator">/</span> Leads 
          <span className="dl-separator">/</span> <strong style={{color: '#8c6cf5'}}>Duplicate Leads</strong>
        </div>
      </div>

      {/* Main Content */}
      <div className="dl-content-card">
        <div className="dl-toolbar">
          {hasExportPermission && (
            <div className="dl-export-buttons">
              <button className="dl-export-btn" onClick={handleCopy}>Copy</button>
              <button className="dl-export-btn" onClick={handleExportExcel}>Excel</button>
              <button className="dl-export-btn" onClick={handleExportCSV}>CSV</button>
              <button className="dl-export-btn" onClick={handleExportPDF}>PDF</button>
            </div>
          )}
          <div className="dl-search-container">
            <span className="dl-search-label">Search:</span>
            <input 
              type="text" 
              className="dl-search-input" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="dl-table-container">
          <table className="dl-table">
            <thead>
              <tr>
                <th>#</th>
                <th className="sortable">Enquiry<br/>Name <ArrowUpDown className="dl-sort-icon"/></th>
                <th className="sortable">Phone<br/>Number <ArrowUpDown className="dl-sort-icon"/></th>
                <th className="sortable">Primary<br/>Source <ArrowUpDown className="dl-sort-icon"/></th>
                <th className="sortable">Secondary<br/>Source <ArrowUpDown className="dl-sort-icon"/></th>
                <th className="sortable">Project<br/>Interested <ArrowUpDown className="dl-sort-icon"/></th>
                <th className="sortable">Status <ArrowUpDown className="dl-sort-icon"/></th>
                <th className="sortable">Owner <ArrowUpDown className="dl-sort-icon"/></th>
                <th className="sortable">Call Remarks <ArrowUpDown className="dl-sort-icon"/></th>
                <th className="sortable">Last update <ArrowUpDown className="dl-sort-icon"/></th>
                <th className="sortable">Created Date <ArrowUpDown className="dl-sort-icon"/></th>
                <th className="sortable">Actions <ArrowUpDown className="dl-sort-icon"/></th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, index) => (
                <tr key={row.id || index}>
                  <td>{index + 1}</td>
                  <td>
                    <span className="dl-link">{row.name || 'Unknown'}</span>
                  </td>
                  <td>{row.phone || row.mobile || ''}</td>
                  <td>{row.primarySource || ''}</td>
                  <td>{row.secondarySource || ''}</td>
                  <td>{row.project || ''}</td>
                  <td>
                    <div className="dl-status-cell">
                      <span>{row.status || ''}</span>
                    </div>
                  </td>
                  <td>{row.ownerName || row.owner || ''}</td>
                  <td>
                    <div className="dl-square-icon dl-purple-outline" title="View Logs" style={{ cursor: 'pointer' }} onClick={() => setRemarksModalLeadId(row.id)}>
                      <MessageSquare size={16} />
                    </div>
                  </td>
                  <td>{new Date(row.updatedAt).toLocaleDateString()}</td>
                  <td>{new Date(row.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="dl-actions-cell">
                      <button className="dl-action-btn" title="Edit" onClick={() => navigate(`/leads/${row.id}`)}>
                        <Edit size={14} />
                      </button>
                      <button className="dl-action-btn dl-delete-btn" title="Delete" onClick={() => handleDelete(row)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan="12" style={{textAlign: 'center', padding: '20px'}}>No Duplicate Leads Found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                  const lead = leadsData.find(l => l.id === remarksModalLeadId);
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
