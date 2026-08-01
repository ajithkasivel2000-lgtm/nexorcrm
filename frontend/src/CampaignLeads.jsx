import { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import AdvancedTable from './components/AdvancedTable/AdvancedTable';
import { Home, Filter, X, ChevronDown, ArrowUpDown, RefreshCw, Trash2, Columns, Check, Download } from 'lucide-react';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import './Leads.css';
import './FollowUpLeads.css';
import './CampaignLeads.css';

export default function CampaignLeads() {
  const navigate = useNavigate();
  const context = useOutletContext();
  const loggedInUser = localStorage.getItem('loggedInUser') || '';
  const userRole = context?.userRole || '';
  const isEmployeeLevel = userRole === 'User';
  const isSuperAdmin = loggedInUser === 'admin';

  const tabs = isEmployeeLevel
    ? ['All', 'Duplicate Leads', 'Rejected Leads', 'Site Visit', 'Follow Up Leads']
    : ['All Leads', 'Our Leads', 'Duplicate Leads', 'Rejected Leads', 'Site Visit', 'Follow Up Leads'];

  const [activeTab, setActiveTab] = useState(tabs[0] || 'All Leads');

  useEffect(() => {
    if (!tabs.includes(activeTab)) {
      setActiveTab(tabs[0] || 'All Leads');
    }
  }, [tabs, activeTab]);

  const [followUpSubTab, setFollowUpSubTab] = useState('Follow Up');

  const handleTabClick = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'updatedAt', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isColumnsDropdownOpen, setIsColumnsDropdownOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    name: true, mobile: true, primary: true, secondary: true, project: true, status: true, remarks: true, owner: true, createdAt: true, updatedAt: true
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [filters, setFilters] = useState({
    project: '',
    primarySource: '',
    status: '',
    svStatus: '',
    owner: '',
    quickDate: ''
  });

  // Empty data — no leads to show
  const leadsData = [];

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const applyFilter = () => setIsFilterOpen(false);
  const clearFilter = () => {
    setFilters({ project: '', primarySource: '', status: '', svStatus: '', owner: '', quickDate: '' });
    setIsFilterOpen(false);
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const handleReset = () => {
    setSearchQuery('');
    setSortConfig({ key: 'updatedAt', direction: 'desc' });
    setVisibleColumns({ name: true, mobile: true, primary: true, secondary: true, project: true, status: true, remarks: true, owner: true, createdAt: true, updatedAt: true });
    setCurrentPage(1);
  };

  const toggleColumn = (col) => {
    setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
  };

  const totalPages = 0;
  const currentLeads = [];

  const renderPagination = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(
          <button key={i} className={`page-btn ${currentPage === i ? 'active' : ''}`} onClick={() => setCurrentPage(i)}>{i}</button>
        );
      }
    } else {
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) {
          pages.push(
            <button key={i} className={`page-btn ${currentPage === i ? 'active' : ''}`} onClick={() => setCurrentPage(i)}>{i}</button>
          );
        }
        pages.push(<span key="dots1" className="page-dots">...</span>);
        pages.push(
          <button key={totalPages} className={`page-btn ${currentPage === totalPages ? 'active' : ''}`} onClick={() => setCurrentPage(totalPages)}>{totalPages}</button>
        );
      } else if (currentPage >= totalPages - 3) {
        pages.push(
          <button key={1} className={`page-btn ${currentPage === 1 ? 'active' : ''}`} onClick={() => setCurrentPage(1)}>1</button>
        );
        pages.push(<span key="dots1" className="page-dots">...</span>);
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(
            <button key={i} className={`page-btn ${currentPage === i ? 'active' : ''}`} onClick={() => setCurrentPage(i)}>{i}</button>
          );
        }
      } else {
        pages.push(
          <button key={1} className={`page-btn ${currentPage === 1 ? 'active' : ''}`} onClick={() => setCurrentPage(1)}>1</button>
        );
        pages.push(<span key="dots1" className="page-dots">...</span>);
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(
            <button key={i} className={`page-btn ${currentPage === i ? 'active' : ''}`} onClick={() => setCurrentPage(i)}>{i}</button>
          );
        }
        pages.push(<span key="dots2" className="page-dots">...</span>);
        pages.push(
          <button key={totalPages} className={`page-btn ${currentPage === totalPages ? 'active' : ''}`} onClick={() => setCurrentPage(totalPages)}>{totalPages}</button>
        );
      }
    }
    return pages;
  };

  const exportPDF = () => {
    const doc = new jsPDF('landscape');
    doc.text("Campaign Leads", 14, 15);
    const tableColumn = ["ID", "Name", "Mobile", "Primary", "Secondary", "Projects", "Status", "Remarks"];
    const tableRows = [];
    autoTable(doc, { head: [tableColumn], body: tableRows, startY: 20 });
    doc.save(`campaign_leads_${Date.now()}.pdf`);
  };

  const exportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Name,Mobile,Primary,Secondary,Projects,Status,Remarks,Owner,Created Date\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "campaign_leads.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedLeads(currentLeads.map(lead => lead.id));
    } else {
      setSelectedLeads([]);
    }
  };

  const handleSelectLead = (id) => {
    setSelectedLeads(prev =>
      prev.includes(id) ? prev.filter(leadId => leadId !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = async () => {
    if (window.confirm(`Are you sure you want to delete ${selectedLeads.length} selected lead(s)?`)) {
      setSelectedLeads([]);
    }
  };

  const tableColumns = [
    visibleColumns.name && { key: 'name', header: 'Name', sortable: true },
    visibleColumns.mobile && { key: 'mobile', header: 'Mobile', sortable: true },
    visibleColumns.primary && { key: 'primary', header: 'Primary', sortable: true },
    visibleColumns.secondary && { key: 'secondary', header: 'Secondary', sortable: true },
    visibleColumns.project && { key: 'project', header: 'Projects', sortable: true },
    visibleColumns.status && { key: 'status', header: 'Status', sortable: true },
    visibleColumns.remarks && { key: 'remarks', header: 'Remarks', sortable: false },
    visibleColumns.owner && { key: 'owner', header: 'Owner', sortable: true },
    visibleColumns.createdAt && { key: 'createdAt', header: 'Created Date', sortable: true },
    visibleColumns.updatedAt && { key: 'updatedAt', header: 'Updated Date', sortable: true }
  ].filter(Boolean);

  return (
    <div className="leads-page">
      <div className="leads-header">
        <h2>Campaign Leads</h2>
        <div className="page-breadcrumb">
          <Home size={14} style={{ cursor: 'pointer' }} onClick={() => navigate('/')} /> <span className="slash">/</span> <span className="current">Campaign Leads</span>
        </div>
      </div>

      <div className="leads-card">
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '10px', padding: '15px 20px', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => handleTabClick(tab)}
              style={{
                display: 'flex', alignItems: 'center', padding: '8px 16px', border: 'none',
                background: activeTab === tab ? '#8c6cf5' : '#f1f5f9',
                color: activeTab === tab ? 'white' : '#475569', borderRadius: '6px',
                cursor: 'pointer', fontWeight: '500', fontSize: '14px', whiteSpace: 'nowrap', transition: 'all 0.2s'
              }}
            >
              {tab}
              <span style={{
                marginLeft: '8px', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600',
                backgroundColor: '#e2e8f0', color: '#475569'
              }}>0</span>
            </button>
          ))}
        </div>

        {/* Follow Up sub-tabs */}
        {activeTab === 'Follow Up Leads' && (
          <div style={{ padding: '15px 20px 0 20px' }}>
            <div className="fl-tabs">
              <button
                className={`fl-tab ${followUpSubTab === 'Follow Up' ? 'active' : ''}`}
                onClick={() => { setFollowUpSubTab('Follow Up'); setCurrentPage(1); }}
              >
                Follow Up
              </button>
              <button
                className={`fl-tab ${followUpSubTab === 'Missed Follow Up' ? 'active' : ''}`}
                onClick={() => { setFollowUpSubTab('Missed Follow Up'); setCurrentPage(1); }}
              >
                Missed Follow Up
              </button>
              <button
                className={`fl-tab ${followUpSubTab === 'Tomorrow Follow Up' ? 'active' : ''}`}
                onClick={() => { setFollowUpSubTab('Tomorrow Follow Up'); setCurrentPage(1); }}
              >
                Tomorrow Follow Up
              </button>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="leads-toolbar" style={{ marginTop: '10px' }}>
          <div className="toolbar-left" style={{ position: 'relative' }}>
            <button className="btn-export" style={{ backgroundColor: '#e6e6fa', color: '#3b247f', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }} onClick={() => setIsColumnsDropdownOpen(!isColumnsDropdownOpen)}>
              <Columns size={14} /> Columns <ChevronDown size={12} />
            </button>
            {isColumnsDropdownOpen && (
              <div style={{ position: 'absolute', top: '100%', left: '0', backgroundColor: '#e6e6fa', color: '#3b247f', borderRadius: '4px', zIndex: 10, marginTop: '5px', minWidth: '150px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                {Object.keys(visibleColumns).map(col => (
                  <div key={col} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(0,0,0,0.05)' }} onClick={() => toggleColumn(col)}>
                    <span style={{ textTransform: 'capitalize' }}>{col}</span>
                    {visibleColumns[col] && <Check size={14} />}
                  </div>
                ))}
              </div>
            )}

            <button className="btn-export" style={{ backgroundColor: '#009688', color: 'white', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }} onClick={handleReset}>
              <RefreshCw size={14} /> Reset
            </button>

            <button className="btn-export" style={{ backgroundColor: '#ffe6cc', color: '#a0522d', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }} onClick={exportCSV}>
              <Download size={14} /> Export CSV
            </button>

            <button className="btn-export" style={{ backgroundColor: '#ffebee', color: '#b71c1c', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }} onClick={exportPDF}>
              <Download size={14} /> Export PDF
            </button>
          </div>
          <div className="toolbar-right">
            {selectedLeads.length > 0 && (
              <button onClick={handleDeleteSelected} style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', marginRight: '10px', fontSize: '13px', fontWeight: '500' }}>
                <Trash2 size={14} /> Delete
              </button>
            )}
            <button className="btn-filter" onClick={() => setIsFilterOpen(true)}>
              <Filter size={16} />
            </button>
          </div>
        </div>

        {/* Search & Entries */}
        <div className="leads-search-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="leads-entries" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#4a5568' }}>
            <select
              value={itemsPerPage}
              onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="leads-search-input"
              style={{ width: '60px', padding: '4px 8px' }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>entries per page</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label>Search:</label>
            <input type="text" className="leads-search-input" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} />
          </div>
        </div>

        <AdvancedTable
          columns={tableColumns}
          data={currentLeads}
          sortConfig={sortConfig}
          onSort={handleSort}
          selectedIds={selectedLeads}
          onSelectAll={handleSelectAll}
          onSelectRow={handleSelectLead}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          totalItems={0}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Filter Drawer */}
      {isFilterOpen && (
        <div className="filter-overlay" onClick={() => setIsFilterOpen(false)}>
          <div className="filter-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="filter-header">
              <h3>Filter</h3>
              <button className="filter-close" onClick={() => setIsFilterOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="filter-body">
              <div className="filter-group">
                <label>Project</label>
                <select name="project" value={filters.project} onChange={handleFilterChange}>
                  <option value="">Select options</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Primary Source</label>
                <select name="primarySource" value={filters.primarySource} onChange={handleFilterChange}>
                  <option value="">Select options</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Lead Status</label>
                <select name="status" value={filters.status} onChange={handleFilterChange}>
                  <option value="">Select options</option>
                </select>
              </div>
              <div className="filter-group">
                <label>SV Status</label>
                <select name="svStatus" value={filters.svStatus} onChange={handleFilterChange}>
                  <option value="">Select options</option>
                </select>
              </div>
              <div className="filter-group">
                <label>User</label>
                <select name="owner" value={filters.owner} onChange={handleFilterChange}>
                  <option value="">Select options</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Quick Date</label>
                <select name="quickDate" value={filters.quickDate} onChange={handleFilterChange}>
                  <option value="">Select</option>
                  <option value="Today">Today</option>
                  <option value="Yesterday">Yesterday</option>
                  <option value="This Week">This Week</option>
                  <option value="Last Week">Last Week</option>
                  <option value="This Month">This Month</option>
                  <option value="Last Month">Last Month</option>
                  <option value="This Year">This Year</option>
                </select>
              </div>
              <div className="filter-actions">
                <button className="btn-clear" onClick={clearFilter}>Clear</button>
                <button className="btn-apply" onClick={applyFilter}>Apply Filter</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
