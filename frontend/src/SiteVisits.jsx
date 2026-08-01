import React, { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Home, ArrowUpDown, Edit, Trash2, MessageSquare, Edit3 } from 'lucide-react';
import './SiteVisits.css';

export default function SiteVisits() {
  const [searchTerm, setSearchTerm] = useState('');
  const [leadsData, setLeadsData] = useState([]);
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
      const response = await fetch(`/api/leads?status=Site Visit&username=${loggedInUser}`);
      if (response.ok) {
        const data = await response.json();
        setLeadsData(data);
      }
    } catch (error) {
      console.error('Failed to fetch site visit leads:', error);
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
    link.setAttribute('download', 'site_visits.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    // Re-use CSV logic for simplicity but with .csv extension since pure frontend .xls is complex
    handleExportCSV();
  };

  const handleExportPDF = () => {
    window.print();
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
    <div className="site-visits-container">
      {/* Header Block */}
      <div className="sv-header-block">
        <h1 className="sv-title">Site Visit Leads</h1>
        <p className="sv-subtitle">Turning Inquiries into Invaluable Real Estate Opportunities</p>
        <div className="sv-breadcrumbs">
          <Home className="sv-home-icon" style={{cursor: 'pointer'}} onClick={() => navigate('/')} /> 
          <span className="sv-separator">/</span> Leads 
          <span className="sv-separator">/</span> Rejected Leads 
          <span className="sv-separator">/</span> Follow Up Leads 
          <span className="sv-separator">/</span> <strong style={{color: '#8c6cf5'}}>Site Visits</strong>
        </div>
      </div>

      {/* Main Content */}
      <div className="sv-content-card">
        <div className="sv-toolbar">
          {hasExportPermission && (
            <div className="sv-export-buttons">
              <button className="sv-export-btn" onClick={handleExportExcel}>Excel</button>
              <button className="sv-export-btn" onClick={handleExportCSV}>CSV</button>
              <button className="sv-export-btn" onClick={handleExportPDF}>PDF</button>
            </div>
          )}
          <div className="sv-search-container">
            <span className="sv-search-label">Search:</span>
            <input 
              type="text" 
              className="sv-search-input" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="sv-table-container">
          <table className="sv-table">
            <thead>
              <tr>
                <th>#</th>
                <th className="sortable">Enquiry<br/>Name <ArrowUpDown className="sv-sort-icon"/></th>
                <th className="sortable">Phone<br/>Number <ArrowUpDown className="sv-sort-icon"/></th>
                <th className="sortable">Primary<br/>Source <ArrowUpDown className="sv-sort-icon"/></th>
                <th className="sortable">Secondary<br/>Source <ArrowUpDown className="sv-sort-icon"/></th>
                <th className="sortable">Project<br/>Interested <ArrowUpDown className="sv-sort-icon"/></th>
                <th className="sortable">Status <ArrowUpDown className="sv-sort-icon"/></th>
                <th className="sortable">Owner <ArrowUpDown className="sv-sort-icon"/></th>
                <th className="sortable">Remarks <ArrowUpDown className="sv-sort-icon"/></th>
                <th className="sortable">Last update <ArrowUpDown className="sv-sort-icon"/></th>
                <th className="sortable">Created Date <ArrowUpDown className="sv-sort-icon"/></th>
                <th className="sortable">Actions <ArrowUpDown className="sv-sort-icon"/></th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, index) => (
                <tr key={row.id || index}>
                  <td>{index + 1}</td>
                  <td>
                    <span className="sv-link">{row.name || 'Unknown'}</span>
                  </td>
                  <td>{row.phone || row.mobile || ''}</td>
                  <td>{row.primarySource || ''}</td>
                  <td>{row.secondarySource || ''}</td>
                  <td>{row.project || ''}</td>
                  <td>
                    <div className="sv-status-cell">
                      <span>{row.status || ''}</span>
                      <div 
                        className="sv-square-icon sv-purple-bg" 
                        style={{cursor: 'pointer'}} 
                        onClick={() => navigate(`/leads/${row.id}`)}
                      >
                        <Edit3 size={14} />
                      </div>
                    </div>
                  </td>
                  <td>{row.ownerName || row.owner || ''}</td>
                  <td>
                    <div className="sv-square-icon sv-purple-outline" title={row.callRemarks || row.remarks || 'No remarks'}>
                      <MessageSquare size={16} />
                    </div>
                  </td>
                  <td>{new Date(row.updatedAt).toLocaleDateString()}</td>
                  <td>{new Date(row.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="sv-actions-cell">
                      <button className="sv-action-btn" title="Edit" onClick={() => navigate(`/leads/${row.id}`)}>
                        <Edit size={14} />
                      </button>
                      <button className="sv-action-btn sv-delete-btn" title="Delete" onClick={() => handleDelete(row)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan="12" style={{textAlign: 'center', padding: '20px'}}>No Site Visits Found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
