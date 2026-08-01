import { useState, useEffect } from 'react';
import { Home, Edit, ArrowUpDown, Download } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import AdvancedTable from './components/AdvancedTable/AdvancedTable';
import './Customers.css';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export default function Customers() {
  const navigate = useNavigate();
  const context = useOutletContext();
  const loggedInUser = localStorage.getItem('loggedInUser') || '';
  const pagePerm = context?.permissionsList?.find(p => p.page === 'customers');
  const hasExportPermission = loggedInUser === 'admin' ? true : (pagePerm ? !!pagePerm.export : true);

  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/customers');
      if (response.ok) {
        const data = await response.json();
        setCustomers(data);
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    }
  };

  const rawFilteredCustomers = customers.filter(cust =>
    (cust.customerId && cust.customerId.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (cust.customerName && cust.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (cust.customerEmail && cust.customerEmail.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredCustomers = [...rawFilteredCustomers].sort((a, b) => {
    const aDate = new Date(a.updatedAt || a.createdAt).getTime();
    const bDate = new Date(b.updatedAt || b.createdAt).getTime();
    return bDate - aDate;
  });

  const exportCSV = () => {
    const headers = ["Sl", "Customer Id", "Customer Name", "Customer Email", "Customer Mobile", "Stage", "Created Date"];
    const rows = filteredCustomers.map((cust, index) => [
      index + 1,
      cust.customerId || "",
      cust.customerName || "",
      cust.customerEmail || "",
      cust.customerMobile || "",
      cust.stage || "",
      new Date(cust.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }).replace(/,/g, "")
    ]);
    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "customers.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(
      filteredCustomers.map((cust, index) => ({
        "Sl": index + 1,
        "Customer Id": cust.customerId || "",
        "Customer Name": cust.customerName || "",
        "Customer Email": cust.customerEmail || "",
        "Customer Mobile": cust.customerMobile || "",
        "Stage": cust.stage || "",
        "Created Date": new Date(cust.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      }))
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");
    XLSX.writeFile(workbook, "customers.xlsx");
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Customers", 14, 15);
    const tableColumn = ["Sl", "Customer Id", "Customer Name", "Customer Email", "Customer Mobile", "Stage", "Created Date"];
    const tableRows = [];
    filteredCustomers.forEach((cust, index) => {
      tableRows.push([
        index + 1,
        cust.customerId || "-",
        cust.customerName || "-",
        cust.customerEmail || "-",
        cust.customerMobile || "-",
        cust.stage || "-",
        new Date(cust.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      ]);
    });
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });
    doc.save(`customers_${Date.now()}.pdf`);
  };

  const tableColumns = [
    { key: 'customerId', header: 'Customer Id', sortable: true },
    { key: 'customerName', header: 'Customer Name', sortable: true, renderCell: (row) => row.customerName || '-' },
    { key: 'customerEmail', header: 'Customer Email', sortable: true, renderCell: (row) => row.customerEmail || '-' },
    { key: 'customerMobile', header: 'Customer Mobile', sortable: true, renderCell: (row) => row.customerMobile || '-' },
    { key: 'stage', header: 'Stage', sortable: true, renderCell: (row) => row.stage || '-' },
    { key: 'createdAt', header: 'Created Date', sortable: true, renderCell: (row) => new Date(row.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) },
    {
      key: 'actions', header: 'Actions', sortable: false,
      renderCell: (row) => (
        <button
          className="btn-action edit-outline"
          onClick={() => navigate(`/customers/${row.id}`)}
        >
          <Edit size={14} />
        </button>
      )
    }
  ];

  return (
    <div className="customers-page">
      <div className="customers-header">
        <h2>Customer</h2>
        <div className="page-breadcrumb">
          <Home size={14} style={{ cursor: 'pointer' }} onClick={() => navigate('/')} /> <span className="slash">/</span> <span className="current">Customer</span>
        </div>
      </div>

      <div className="customers-card">
        <div className="customers-toolbar">
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
          data={filteredCustomers}
          sortConfig={{}} // Basic pagination/setup absent in original
          selectedIds={[]}
          onSelectAll={() => { }}
          onSelectRow={() => { }}
          currentPage={1}
          itemsPerPage={filteredCustomers.length > 0 ? filteredCustomers.length : 1}
          totalItems={filteredCustomers.length}
          onPageChange={() => { }}
        />
      </div>
    </div>
  );
}
