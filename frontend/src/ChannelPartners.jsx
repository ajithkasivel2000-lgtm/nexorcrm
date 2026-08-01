import { useState, useEffect } from 'react';
import { Home, Edit, Trash2 } from 'lucide-react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import AdvancedTable from './components/AdvancedTable/AdvancedTable';
import './ChannelPartners.css';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function ChannelPartners() {
  const navigate = useNavigate();
  const context = useOutletContext();
  const loggedInUser = localStorage.getItem('loggedInUser') || '';
  const pagePerm = context?.permissionsList?.find(p => p.page === 'channel-partners');
  const hasExportPermission = loggedInUser === 'admin' ? true : (pagePerm ? !!pagePerm.export : true);

  const [partners, setPartners] = useState([]);

  useEffect(() => {
    fetchPartners();
  }, []);

  const fetchPartners = async () => {
    try {
      const response = await fetch('/api/channel-partners');
      if (response.ok) {
        const data = await response.json();
        setPartners(data);
      }
    } catch (error) {
      console.error('Failed to fetch channel partners:', error);
    }
  };

  const sortedPartners = [...partners].sort((a, b) => {
    const aDate = new Date(a.updatedAt || a.createdAt).getTime();
    const bDate = new Date(b.updatedAt || b.createdAt).getTime();
    return bDate - aDate;
  });

  const handleDelete = async (id, cpId) => {
    const isConfirmed = window.confirm(`re.nexorcrm.com says\nAre you sure you wish to delete this [ ${cpId}-undefined ] RRQ?\nIt will remove all users from the RRQ.`);
    if (isConfirmed) {
      try {
        const response = await fetch(`/api/channel-partners/${id}`, {
          method: 'DELETE'
        });
        if (response.ok) {
          setPartners(partners.filter(p => p.id !== id));
        }
      } catch (error) {
        console.error('Failed to delete channel partner:', error);
      }
    }
  };

  const exportCSV = () => {
    const headers = ["CP ID", "Company Name", "Partner's Name", "Mobile", "Email Address", "Status", "Created Date"];
    const rows = sortedPartners.map((partner) => [
      partner.cpId || "",
      partner.companyName || "",
      partner.ownerName || "",
      partner.mobileNumber || "",
      partner.emailAddress || "",
      partner.status || "",
      new Date(partner.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }).replace(/,/g, "")
    ]);
    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "channel_partners.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Channel Partners", 14, 15);
    const tableColumn = ["CP ID", "Company Name", "Partner's Name", "Mobile", "Email Address", "Status", "Created Date"];
    const tableRows = [];
    sortedPartners.forEach((partner) => {
      tableRows.push([
        partner.cpId || "-",
        partner.companyName || "-",
        partner.ownerName || "-",
        partner.mobileNumber || "-",
        partner.emailAddress || "-",
        partner.status || "-",
        new Date(partner.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      ]);
    });
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });
    doc.save(`channel_partners_${Date.now()}.pdf`);
  };

  const tableColumns = [
    { key: 'cpId', header: 'CP ID', sortable: true },
    { key: 'companyName', header: 'Company Name', sortable: true },
    { key: 'ownerName', header: "Partner's Name", sortable: true },
    { key: 'mobileNumber', header: 'Mobile', sortable: true },
    { key: 'emailAddress', header: 'Email Address', sortable: true },
    { key: 'status', header: 'Status', sortable: true },
    { key: 'createdAt', header: 'Created Date', sortable: true, renderCell: (row) => new Date(row.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) },
    {
      key: 'actions', header: 'Actions', sortable: false,
      renderCell: (row) => (
        <>
          <button
            className="btn-action edit-action"
            onClick={() => navigate(`/channel-partners/edit/${row.id}`)}
          >
            <Edit size={14} />
          </button>
          <button
            className="btn-action delete-action"
            onClick={() => handleDelete(row.id, row.cpId)}
          >
            <Trash2 size={14} />
          </button>
        </>
      )
    }
  ];

  return (
    <div className="cp-page">
      <div className="cp-header">
        <div className="cp-header-left">
          <div className="cp-header-title">
            <h2>Channel Partners</h2>
          </div>
          <div className="cp-header-subtitle">
            Create, view and edit Channel Partners. Assign users to Lead List
          </div>
          <div className="page-breadcrumb">
            <Home size={14} style={{ cursor: 'pointer' }} onClick={() => navigate('/')} /> <span className="slash">/</span> <span className="current">Channel Partners</span>
          </div>
        </div>
        <div className="cp-header-right">
          <Link to="/channel-partners/create" className="btn-create-cp">
            Create Channel Partners
          </Link>
        </div>
      </div>

      <div className="cp-card">
        {hasExportPermission && (
          <div style={{ marginBottom: '18px', display: 'flex', gap: '10px' }}>
            <button
              onClick={exportCSV}
              style={{ padding: '7px 14px', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '13px', cursor: 'pointer', backgroundColor: '#7b68ee', transition: 'opacity 0.2s' }}
              onMouseEnter={(e) => e.target.style.opacity = '0.9'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              Export CSV
            </button>
            <button
              onClick={exportPDF}
              style={{ padding: '7px 14px', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '13px', cursor: 'pointer', backgroundColor: '#ef4444', transition: 'opacity 0.2s' }}
              onMouseEnter={(e) => e.target.style.opacity = '0.9'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              Export PDF
            </button>
          </div>
        )}

        <AdvancedTable
          columns={tableColumns}
          data={sortedPartners}
          sortConfig={{}} // Basic pagination/setup absent in original
          selectedIds={[]}
          onSelectAll={() => { }}
          onSelectRow={() => { }}
          currentPage={1}
          itemsPerPage={sortedPartners.length > 0 ? sortedPartners.length : 1}
          totalItems={sortedPartners.length}
          enableSelection={false}
        />
      </div>
    </div>
  );
}
