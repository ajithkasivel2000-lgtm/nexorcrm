import { useState, useEffect } from 'react';
import { Home, Edit, ArrowUpDown, MessageSquare, X, Download } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import AdvancedTable from './components/AdvancedTable/AdvancedTable';
import './Opportunities.css';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export default function Opportunities() {
  const navigate = useNavigate();
  const context = useOutletContext();
  const loggedInUser = localStorage.getItem('loggedInUser') || '';
  const pagePerm = context?.permissionsList?.find(p => p.page === 'opportunities');
  const hasExportPermission = loggedInUser === 'admin' ? true : (pagePerm ? !!pagePerm.export : true);

  const [opportunities, setOpportunities] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOppForLogs, setSelectedOppForLogs] = useState(null);

  useEffect(() => {
    fetchOpportunities();
  }, []);

  const handleOpenLogs = async (id) => {
    try {
      const response = await fetch(`/api/opportunities/${id}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedOppForLogs(data);
      }
    } catch (error) {
      console.error('Failed to fetch opportunity logs:', error);
    }
  };

  const fetchOpportunities = async () => {
    try {
      const loggedInUser = localStorage.getItem('loggedInUser') || '';
      const response = await fetch(`/api/opportunities?username=${loggedInUser}`);
      if (response.ok) {
        const data = await response.json();
        setOpportunities(data);
      }
    } catch (error) {
      console.error('Failed to fetch opportunities:', error);
    }
  };

  const rawFilteredOpportunities = opportunities.filter(opp =>
    (opp.oppId && opp.oppId.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (opp.leadId && opp.leadId.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredOpportunities = [...rawFilteredOpportunities].sort((a, b) => {
    const aDate = new Date(a.updatedAt || a.createdAt).getTime();
    const bDate = new Date(b.updatedAt || b.createdAt).getTime();
    return bDate - aDate;
  });

  const exportCSV = () => {
    const headers = ["Sl.No", "OPP Id", "OPP Name", "Mobile", "Status", "Remarks", "Owner", "Created Date", "Updated Date"];
    const rows = filteredOpportunities.map((opp, index) => [
      index + 1,
      opp.oppId || "",
      opp.opportunityName || "",
      opp.mobileNumber || "",
      opp.stage || "",
      opp.comments || "",
      opp.opportunityOwner || "",
      new Date(opp.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }).replace(/,/g, ""),
      new Date(opp.updatedAt || opp.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }).replace(/,/g, "")
    ]);
    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "opportunities.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(
      filteredOpportunities.map((opp, index) => ({
        "Sl.No": index + 1,
        "OPP Id": opp.oppId || "",
        "OPP Name": opp.opportunityName || "",
        "Mobile": opp.mobileNumber || "",
        "Status": opp.stage || "",
        "Remarks": opp.comments || "",
        "Owner": opp.opportunityOwner || "",
        "Created Date": new Date(opp.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        "Updated Date": new Date(opp.updatedAt || opp.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      }))
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Opportunities");
    XLSX.writeFile(workbook, "opportunities.xlsx");
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Opportunities", 14, 15);
    const tableColumn = ["Sl", "OPP Id", "OPP Name", "Mobile", "Status", "Remarks", "Owner", "Created Date", "Updated Date"];
    const tableRows = [];
    filteredOpportunities.forEach((opp, index) => {
      tableRows.push([
        index + 1,
        opp.oppId || "-",
        opp.opportunityName || "-",
        opp.mobileNumber || "-",
        opp.stage || "-",
        opp.comments || "-",
        opp.opportunityOwner || "-",
        new Date(opp.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        new Date(opp.updatedAt || opp.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      ]);
    });
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });
    doc.save(`opportunities_${Date.now()}.pdf`);
  };


  const tableColumns = [
    { key: 'oppId', header: 'OPP Id', sortable: true },
    { key: 'opportunityName', header: 'OPP Name', sortable: true, renderCell: (row) => row.opportunityName || '-' },
    { key: 'mobileNumber', header: 'Mobile', sortable: true, renderCell: (row) => row.mobileNumber || '-' },
    { key: 'enquiryProject', header: 'Project', sortable: true, renderCell: (row) => row.enquiryProject || '-' },
    { key: 'stage', header: 'Status', sortable: true, renderCell: (row) => row.stage || '-' },
    {
      key: 'remarks', header: 'Remarks', sortable: false,
      renderCell: (row) => (
        <div className="action-buttons" style={{ display: 'flex', justifyContent: 'center' }}>
          <button className="btn-action message-outline" onClick={() => handleOpenLogs(row.id)}>
            <MessageSquare size={14} color="#8c6cf5" />
          </button>
        </div>
      )
    },
    { key: 'opportunityOwner', header: 'Owner', sortable: true, renderCell: (row) => row.opportunityOwner || '-' },
    { key: 'createdAt', header: 'Created Date', sortable: true, renderCell: (row) => new Date(row.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) },
    { key: 'updatedAt', header: 'Updated Date', sortable: true, renderCell: (row) => new Date(row.updatedAt || row.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) },
    {
      key: 'actions', header: 'Actions', sortable: false,
      renderCell: (row) => (
        <button
          className="btn-action edit-outline"
          onClick={() => navigate(`/opportunities/${row.id}`)}
        >
          <Edit size={14} />
        </button>
      )
    }
  ];

  return (
    <div className="opportunities-page">
      <div className="opportunities-header">
        <h2>Opportunity</h2>
        <div className="page-breadcrumb">
          <Home size={14} style={{ cursor: 'pointer' }} onClick={() => navigate('/')} /> <span className="slash">/</span> <span className="current">Opportunity</span>
        </div>
      </div>

      <div className="opportunities-card">
        <div className="opportunities-toolbar">
          {hasExportPermission && (
            <div className="toolbar-left">
              <button className="btn-export" style={{ backgroundColor: '#ffe6cc', color: '#a0522d', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }} onClick={exportCSV}>
                <Download size={14} /> Export CSV
              </button>
              <button className="btn-export" style={{ backgroundColor: '#ffebee', color: '#b71c1c', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }} onClick={exportPDF}>
                <Download size={14} /> Export PDF
              </button>
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

        <AdvancedTable
          columns={tableColumns}
          data={filteredOpportunities}
          sortConfig={{}} // Not fully implemented in original
          selectedIds={[]} // Selectors absent in original
          onSelectAll={() => { }}
          onSelectRow={() => { }}
          currentPage={1}
          itemsPerPage={filteredOpportunities.length > 0 ? filteredOpportunities.length : 1}
          totalItems={filteredOpportunities.length}
          onPageChange={() => { }}
        />
      </div>

      {selectedOppForLogs && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>Opp Logs for [{selectedOppForLogs.oppId}]</h3>
              <button className="modal-close" onClick={() => setSelectedOppForLogs(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <div className="log-list" style={{ padding: '20px' }}>
                {selectedOppForLogs.logs && selectedOppForLogs.logs.length > 0 ? (
                  <div className="log-item" style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                    <div className="log-avatar-img">
                      <img src="https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=f0ecfc" alt="avatar" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                    </div>
                    <div className="log-content">
                      <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>{selectedOppForLogs.logs[0].title}</p>
                      <span style={{ display: 'block', color: '#666', fontSize: '13px', marginBottom: '3px' }}>
                        {selectedOppForLogs.logs[0].subtitle ? selectedOppForLogs.logs[0].subtitle.replace('by admin ', '') : ''}
                      </span>
                      <span className="log-date" style={{ color: '#999', fontSize: '12px' }}>on {new Date(selectedOppForLogs.logs[0].date).toLocaleString()}</span>
                    </div>
                  </div>
                ) : (
                  <div className="log-item" style={{ display: 'flex', gap: '15px' }}>
                    <div className="log-avatar-img">
                      <img src="https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=f0ecfc" alt="avatar" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                    </div>
                    <div className="log-content">
                      <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>Lead To Opportunity</p>
                      <span className="log-date" style={{ color: '#999', fontSize: '12px' }}>on {new Date(selectedOppForLogs.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
