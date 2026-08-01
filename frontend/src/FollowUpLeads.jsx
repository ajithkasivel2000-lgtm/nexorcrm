import React, { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Home, ArrowUpDown, Edit, Trash2, MessageSquare } from 'lucide-react';
import './FollowUpLeads.css';

export default function FollowUpLeads() {
  const [searchTerm, setSearchTerm] = useState('');
  const [leadsData, setLeadsData] = useState([]);
  const [activeTab, setActiveTab] = useState('Follow Up');
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
      const response = await fetch(`/api/leads?username=${loggedInUser}`);
      if (response.ok) {
        const data = await response.json();
        setLeadsData(data);
      }
    } catch (error) {
      console.error('Failed to fetch follow up leads:', error);
    }
  };

  const handleCopy = () => {
    const textContent = leadsData.map(row => 
      `${row.id}\t${row.name}\t${row.phone}\t${row.primarySource}\t${row.secondarySource}\t${row.project}\t${row.status}\t${row.ownerName || row.owner}\t${row.followUpDate}\t${row.createdDate}`
    ).join('\n');
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(textContent).then(() => {
        alert('Table data copied to clipboard!');
      });
    } else {
      alert('Clipboard API not available.');
    }
  };

  const downloadMockFile = (type) => {
    const headers = ['ID', 'Enquiry Name', 'Phone', 'Primary Source', 'Secondary Source', 'Project', 'Status', 'Owner', 'Follow Up Date', 'Created Date'];
    const rows = leadsData.map(row => 
      [row.id, row.name, row.phone, row.primarySource, row.secondarySource, row.project, row.status, row.ownerName || row.owner, row.followUpDate, row.createdDate]
    );

    let content = '';
    let filename = `FollowUpLeads.${type.toLowerCase()}`;
    let mimeType = 'text/plain';

    if (type === 'CSV' || type === 'Excel') {
      content = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');
      filename = type === 'Excel' ? 'FollowUpLeads.csv' : 'FollowUpLeads.csv'; // Fallback to CSV for Excel for simplicity
      mimeType = 'text/csv;charset=utf-8;';
    } else if (type === 'PDF') {
      content = 'Follow Up Leads Data\n\n' + [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
      filename = 'FollowUpLeads.txt'; // Using txt since real PDF generation requires a library, but user will get a file
      mimeType = 'text/plain;charset=utf-8;';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleEdit = (id) => {
    navigate(`/leads/${id}`);
  };

  const handleDelete = async (id, name, phone) => {
    const confirmDelete = window.confirm(`Are you sure you wish to delete this [ ${name} ${phone.replace('+91 ', '')} ] Leads? It will remove leads from the list.`);
    if (confirmDelete) {
      try {
        const response = await fetch(`/api/leads/${id}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          setLeadsData(prev => prev.filter(lead => lead.id !== id));
        }
      } catch (error) {
        console.error('Failed to delete lead:', error);
      }
    }
  };

  const filteredData = leadsData.filter(item => {
    const itemName = item.name || '';
    const itemPhone = item.phone || item.mobile || '';
    const matchesSearch = itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           itemPhone.includes(searchTerm);
           
    if (!matchesSearch) return false;
    if (!item.followUpDate) return false;

    const followUpDate = new Date(item.followUpDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const nextDay = new Date(tomorrow);
    nextDay.setDate(nextDay.getDate() + 1);

    if (activeTab === 'Missed Follow Up') {
      return followUpDate < today;
    } else if (activeTab === 'Tomorrow Follow Up') {
      return followUpDate >= tomorrow && followUpDate < nextDay;
    } else {
      return true;
    }
  });

  return (
    <div className="fl-container">
      {/* Header Block */}
      <div className="fl-header-block">
        <h1 className="fl-title">Follow Up Leads</h1>
        <p className="fl-subtitle">Turning Inquiries into Invaluable Real Estate Opportunities</p>
        <div className="fl-breadcrumbs">
          <Home className="fl-home-icon" style={{cursor: 'pointer'}} onClick={() => navigate('/')} /> 
          <span className="fl-separator">/</span> Leads 
          <span className="fl-separator">/</span> Site Visit Leads
          <span className="fl-separator">/</span> Rejected Leads
          <span className="fl-separator">/</span> <strong style={{color: '#8c6cf5'}}>Follow Up Leads</strong>
        </div>
      </div>

      {/* Tabs */}
      <div className="fl-tab-nav">
        <div className="fl-tabs">
          <button 
            className={`fl-tab ${activeTab === 'Follow Up' ? 'active' : ''}`}
            onClick={() => setActiveTab('Follow Up')}
          >
            <span className="fl-tab-icon"></span> Follow Up
          </button>
          <button 
            className={`fl-tab ${activeTab === 'Missed Follow Up' ? 'active' : ''}`}
            onClick={() => setActiveTab('Missed Follow Up')}
          >
            <span className="fl-tab-icon"></span> Missed Follow Up
          </button>
          <button 
            className={`fl-tab ${activeTab === 'Tomorrow Follow Up' ? 'active' : ''}`}
            onClick={() => setActiveTab('Tomorrow Follow Up')}
          >
            <span className="fl-tab-icon"></span> Tomorrow Follow Up
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="fl-content-card">
        <div className="fl-toolbar">
          {hasExportPermission && (
            <div className="fl-export-buttons">
              <button className="fl-export-btn" onClick={handleCopy}>Copy</button>
              <button className="fl-export-btn" onClick={() => downloadMockFile('Excel')}>Excel</button>
              <button className="fl-export-btn" onClick={() => downloadMockFile('CSV')}>CSV</button>
              <button className="fl-export-btn" onClick={() => downloadMockFile('PDF')}>PDF</button>
            </div>
          )}
          
          <div className="fl-search-container">
            <span className="fl-search-label">Search:</span>
            <input 
              type="text" 
              className="fl-search-input" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="fl-table-container">
          <table className="fl-table">
            <thead>
              <tr>
                <th className="sortable"># <ArrowUpDown className="fl-sort-icon" /></th>
                <th className="sortable">Enquiry Name <ArrowUpDown className="fl-sort-icon" /></th>
                <th className="sortable">Phone Number <ArrowUpDown className="fl-sort-icon" /></th>
                <th className="sortable">Primary Source <ArrowUpDown className="fl-sort-icon" /></th>
                <th className="sortable">Secondary Source <ArrowUpDown className="fl-sort-icon" /></th>
                <th className="sortable">Project Interested <ArrowUpDown className="fl-sort-icon" /></th>
                <th className="sortable">Status <ArrowUpDown className="fl-sort-icon" /></th>
                <th className="sortable">Owner <ArrowUpDown className="fl-sort-icon" /></th>
                <th className="sortable">Call Remarks <ArrowUpDown className="fl-sort-icon" /></th>
                <th className="sortable">Follow Up Date <ArrowUpDown className="fl-sort-icon" /></th>
                <th className="sortable">Created Date <ArrowUpDown className="fl-sort-icon" /></th>
                <th className="sortable">Actions <ArrowUpDown className="fl-sort-icon" /></th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length > 0 ? (
                filteredData.map((row, idx) => (
                  <tr key={row.id || idx}>
                    <td>{idx + 1}</td>
                    <td>
                      <span className="fl-link" onClick={() => handleEdit(row.id)}>
                        {row.name || 'Unknown'}
                      </span>
                    </td>
                    <td>{row.phone || row.mobile || ''}</td>
                    <td>{row.primarySource || ''}</td>
                    <td>{row.secondarySource || ''}</td>
                    <td>{row.project || ''}</td>
                    <td>
                      <div className="fl-status-cell">
                        <span>{row.status || ''}</span>
                      </div>
                    </td>
                    <td>{row.ownerName || row.owner || ''}</td>
                    <td>
                      <div className="fl-call-remarks" title={row.callRemarks || row.reasonDetails || 'No remarks'}>
                        <MessageSquare size={16} />
                      </div>
                    </td>
                    <td>{row.followUpDate ? new Date(row.followUpDate).toLocaleString() : ''}</td>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                    <td>
                      <div className="fl-actions">
                        <button className="fl-action-btn edit" onClick={() => handleEdit(row.id)}>
                          <Edit size={14} />
                        </button>
                        <button className="fl-action-btn delete" onClick={() => handleDelete(row.id, row.name || 'Unknown', row.phone || row.mobile || '')}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="12" style={{textAlign: 'center', padding: '20px'}}>No Follow Up Leads Found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="fl-footer">
          <div className="fl-showing">
            Showing 1 to {filteredData.length} of {filteredData.length} entries
          </div>
          <div className="fl-pagination">
            <button className="fl-page-btn disabled">Previous</button>
            <button className="fl-page-btn active">1</button>
            <button className="fl-page-btn disabled">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
