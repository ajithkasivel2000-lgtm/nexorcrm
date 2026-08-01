import React, { useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import AdvancedTable from './components/AdvancedTable/AdvancedTable';
import { Home, Filter, Phone, Plus, X, ChevronDown, Edit2, MessageSquare, ArrowUpDown, RefreshCw, Trash2, Columns, Check, Download, AlertTriangle } from 'lucide-react';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import './Leads.css';
import './FollowUpLeads.css';

// Dummy leads array has been removed. Data comes directly from the backend API.

export default function Leads() {
  const navigate = useNavigate();
  const context = useOutletContext();
  const loggedInUser = localStorage.getItem('loggedInUser') || '';
  const userRole = context?.userRole || '';
  const isEmployeeLevel = userRole === 'User';
  const isSuperAdmin = loggedInUser === 'admin';
  // Super admin always has export. Other roles follow page access settings.
  const pagePerm = context?.permissionsList?.find(p => p.page === 'leads');
  const hasExportPermission = isSuperAdmin ? true : (pagePerm ? !!pagePerm.export : true);

  const allTabs = (isEmployeeLevel
    ? ['All', 'Duplicate Leads', 'Rejected Leads', 'Site Visit', 'Follow Up Leads']
    : ['All Leads', 'Our Leads', 'Duplicate Leads', 'Rejected Leads', 'Site Visit', 'Follow Up Leads']
  );
  // Duplicate Leads tab is only accessible to superadmin
  const tabs = allTabs.filter(tab => tab !== 'Duplicate Leads' || isSuperAdmin);

  const [searchParams] = useSearchParams();
  const initialTabFromUrl = searchParams.get('tab');
  const tabMap = {
    'all': 'All',
    'all-leads': 'All Leads',
    'our-leads': 'Our Leads',
    'duplicate': 'Duplicate Leads',
    'rejected': 'Rejected Leads',
    'site-visit': 'Site Visit',
    'follow-up': 'Follow Up Leads'
  };
  const defaultTab = tabs.includes('All Leads') ? 'All Leads' : 'All';
  const urlTab = initialTabFromUrl ? tabMap[initialTabFromUrl.toLowerCase()] : null;
  const initialTab = urlTab && tabs.includes(urlTab) ? urlTab : defaultTab;

  const [leadsData, setLeadsData] = useState([]);
  const [activeTab, setActiveTab] = useState(initialTab);

  // Ensure activeTab is always valid
  React.useEffect(() => {
    if (!tabs.includes(activeTab)) {
      setActiveTab(tabs[0] || 'All Leads');
    }
  }, [tabs, activeTab]);

  // Rejected & Site Visit tabs: edit icons restricted to Super Admin only
  const isRestrictedTab = activeTab === 'Rejected Leads';
  const canEditOnTab = isSuperAdmin || !isRestrictedTab;

  const handleTabClick = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };
  const [followUpSubTab, setFollowUpSubTab] = useState('Follow Up');

  const [projectsList, setProjectsList] = useState([]);
  const [primarySources, setPrimarySources] = useState([]);
  const [secondarySources, setSecondarySources] = useState([]);
  const [tertiarySources, setTertiarySources] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [svStatusList, setSvStatusList] = useState([]);
  const [leadStatusList, setLeadStatusList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'updatedAt', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isColumnsDropdownOpen, setIsColumnsDropdownOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    name: true, mobile: true, primary: true, secondary: true, project: true, status: true, remarks: true, owner: true, createdAt: true, updatedAt: true
  });

  React.useEffect(() => {
    fetchLeads();
    fetchDropdownData();
  }, []);

  const fetchDropdownData = async () => {
    try {
      const pRes = await fetch('/api/projects');
      if (pRes.ok) { const d = await pRes.json(); setProjectsList(d.length ? d.map(x => x.projectName) : []); }
      const psRes = await fetch('/api/primary-sources');
      if (psRes.ok) { const d = await psRes.json(); setPrimarySources(d.length ? d.map(x => x.sourceName) : []); }
      const ssRes = await fetch('/api/secondary-sources');
      if (ssRes.ok) { const d = await ssRes.json(); setSecondarySources(d.length ? d.map(x => x.sourceName) : []); }
      const tsRes = await fetch('/api/tertiary-sources');
      if (tsRes.ok) { const d = await tsRes.json(); setTertiarySources(d.length ? d.map(x => x.sourceName) : []); }
      const uRes = await fetch('/api/users');
      if (uRes.ok) {
        const d = await uRes.json();
        setUsersList(Array.isArray(d) ? d : []);
      }
      const svRes = await fetch('/api/leads/sv-statuses');
      if (svRes.ok) {
        const d = await svRes.json();
        setSvStatusList(Array.isArray(d) ? d : []);
      }
      const lsRes = await fetch('/api/lead-statuses');
      if (lsRes.ok) {
        const d = await lsRes.json();
        setLeadStatusList(Array.isArray(d) ? d : []);
      }
      const cpRes = await fetch('/api/channel-partners');
      if (cpRes.ok) {
        const d = await cpRes.json();
        setChannelPartners(Array.isArray(d) ? d : []);
      }
    } catch (err) {
      setProjectsList([]);
      setPrimarySources([]);
      setSecondarySources([]);
      setTertiarySources([]);
      setUsersList([]);
      setSvStatusList([]);
      setLeadStatusList([]);
      setChannelPartners([]);
    }
  };

  const formatDateString = (dateObj) => {
    const d = new Date(dateObj);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hour = d.getHours();
    const min = String(d.getMinutes()).padStart(2, '0');
    const sec = String(d.getSeconds()).padStart(2, '0');
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = String(hour % 12 || 12).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hour12}:${min}:${sec} ${ampm}`;
  };

  const fetchLeads = async () => {
    try {
      const loggedInUser = localStorage.getItem('loggedInUser') || '';
      const response = await fetch(`/api/leads?username=${loggedInUser}`);
      if (response.ok) {
        const data = await response.json();
        setLeadsData(data.map(lead => ({
          ...lead,
          id: lead.id,
          primary: lead.primarySource,
          secondary: lead.secondarySource,
          date: formatDateString(lead.updatedAt || lead.createdAt),
          formattedCreatedAt: formatDateString(lead.createdAt),
          formattedUpdatedAt: formatDateString(lead.updatedAt || lead.createdAt),
          createdAt: new Date(lead.createdAt).getTime(),
          updatedAt: new Date(lead.updatedAt || lead.createdAt).getTime()
        })));
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('Failed to fetch leads:', response.status, errorData);
      }
    } catch (err) {
      console.error('Failed to fetch leads', err);
    }
  };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedPrimarySource, setSelectedPrimarySource] = useState('');
  const [channelPartners, setChannelPartners] = useState([]);
  const [cpSearchTerm, setCpSearchTerm] = useState('');
  const [isCpDropdownOpen, setIsCpDropdownOpen] = useState(false);
  const [statusModalLeadId, setStatusModalLeadId] = useState(null);
  const [remarksModalLeadId, setRemarksModalLeadId] = useState(null);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isOpenReasonDropdownOpen, setIsOpenReasonDropdownOpen] = useState(false);
  const [isCallStatusDropdownOpen, setIsCallStatusDropdownOpen] = useState(false);
  const [isRejectionTypeDropdownOpen, setIsRejectionTypeDropdownOpen] = useState(false);
  const initialModalFormState = {
    status: 'New Lead',
    openReason: '',
    callStatus: '',
    followUpDate: '',
    callRemarks: '',
    rejectionType: '',
    reasonDetails: '',
    budgetLimit: '',
    competitorName: '',
    competitorOffer: '',
    invalidReason: '',
    otherNotes: '',
    additionalRemarks: '',
    allocateTo: '',
    siteVisitDate: '',
    siteVisitNote: ''
  };
  const [modalFormState, setModalFormState] = useState(initialModalFormState);
  const [toast, setToast] = useState({ visible: false, type: '', message: '' });

  // Reset modal form state when opening for a new lead
  React.useEffect(() => {
    if (statusModalLeadId) {
      const defaultStatus = leadStatusList.length > 0 ? leadStatusList[0].statusName : 'New Lead';
      setModalFormState({ ...initialModalFormState, status: defaultStatus });
    }
  }, [statusModalLeadId, leadStatusList]);

  const showToast = (type, message) => {
    setToast({ visible: true, type, message });
    setTimeout(() => setToast({ visible: false, type: '', message: '' }), 5000);
  };

  const [filters, setFilters] = useState({
    project: '',
    primarySource: '',
    status: '',
    svStatus: '',
    owner: '',
    quickDate: ''
  });

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const applyFilter = () => {
    setIsFilterOpen(false);
  };

  const clearFilter = () => {
    setFilters({
      project: '',
      primarySource: '',
      status: '',
      svStatus: '',
      owner: '',
      quickDate: ''
    });
    setIsFilterOpen(false);
  };
  const cpRef = React.useRef(null);
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (cpRef.current && !cpRef.current.contains(event.target)) {
        setIsCpDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const filteredChannelPartners = React.useMemo(() => {
    if (!cpSearchTerm) return [];
    return channelPartners.filter(partner => {
      const term = cpSearchTerm.toLowerCase();
      const compMatch = partner.companyName && partner.companyName.toLowerCase().includes(term);
      const ownerMatch = partner.ownerName && partner.ownerName.toLowerCase().includes(term);
      return compMatch || ownerMatch;
    });
  }, [channelPartners, cpSearchTerm]);
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const filteredAndSortedLeads = React.useMemo(() => {
    let result = leadsData.filter(lead => {
      // Tab Filtering
      if (activeTab === 'All' || activeTab === 'All Leads') {
        const allowedStatuses = ['New Lead', 'Attempted', 'Interested'];
        if (!allowedStatuses.includes(lead.status)) return false;
      } else if (activeTab === 'Our Leads') {
        const allowedStatuses = ['New Lead', 'Attempted', 'Interested'];
        if (!allowedStatuses.includes(lead.status)) return false;
        if (lead.owner !== loggedInUser) return false;
      } else if (activeTab === 'Duplicate Leads') {
        if (lead.status !== 'Duplicate') return false;
      } else if (activeTab === 'Rejected Leads') {
        if (lead.status !== 'Rejected') return false;
      } else if (activeTab === 'Site Visit') {
        if (lead.status !== 'Site Visit') return false;
      } else if (activeTab === 'Follow Up Leads') {
        if (!lead.followUpDate) return false;
        const followUpDate = new Date(lead.followUpDate);
        if (isNaN(followUpDate.getTime())) return false;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const nextDay = new Date(tomorrow);
        nextDay.setDate(nextDay.getDate() + 1);

        if (followUpSubTab === 'Missed Follow Up') {
          // Missed Follow Up: leads with followUpDate before today (past)
          if (followUpDate >= today) return false;
        } else if (followUpSubTab === 'Tomorrow Follow Up') {
          // Tomorrow Follow Up: leads with followUpDate exactly tomorrow
          if (followUpDate < tomorrow || followUpDate >= nextDay) return false;
        } else if (followUpSubTab === 'Follow Up') {
          // Follow Up: remaining leads (today OR 2+ days from now)
          const isToday = followUpDate >= today && followUpDate < tomorrow;
          const isDayAfterTomorrowOrLater = followUpDate >= nextDay;
          if (!isToday && !isDayAfterTomorrowOrLater) return false;
        }
      }

      // Existing Filters
      if (filters.project && lead.project !== filters.project) return false;
      if (filters.primarySource && lead.primary !== filters.primarySource) return false;
      if (filters.status && lead.status !== filters.status) return false;
      if (filters.svStatus && lead.siteVisitStatus !== filters.svStatus) return false;
      if (filters.owner && lead.owner !== filters.owner) return false;
      // Quick Date filter (filters by lead createdAt)
      if (filters.quickDate) {
        const now = new Date();
        const leadDate = new Date(lead.createdAt);
        const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
        const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
        const todayStart = startOfDay(now);
        const todayEnd = endOfDay(now);

        if (filters.quickDate === 'Today') {
          if (leadDate < todayStart || leadDate > todayEnd) return false;
        } else if (filters.quickDate === 'Yesterday') {
          const ys = new Date(todayStart); ys.setDate(ys.getDate() - 1);
          const ye = new Date(todayEnd); ye.setDate(ye.getDate() - 1);
          if (leadDate < ys || leadDate > ye) return false;
        } else if (filters.quickDate === 'This Week') {
          const day = now.getDay();
          const ws = new Date(todayStart); ws.setDate(ws.getDate() - day);
          const we = new Date(ws); we.setDate(we.getDate() + 6); we.setHours(23, 59, 59, 999);
          if (leadDate < ws || leadDate > we) return false;
        } else if (filters.quickDate === 'Last Week') {
          const day = now.getDay();
          const we = new Date(todayStart); we.setDate(we.getDate() - day - 1); we.setHours(23, 59, 59, 999);
          const ws = new Date(we); ws.setDate(ws.getDate() - 6); ws.setHours(0, 0, 0, 0);
          if (leadDate < ws || leadDate > we) return false;
        } else if (filters.quickDate === 'This Month') {
          const ms = new Date(now.getFullYear(), now.getMonth(), 1);
          const me = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
          if (leadDate < ms || leadDate > me) return false;
        } else if (filters.quickDate === 'Last Month') {
          const ms = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const me = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
          if (leadDate < ms || leadDate > me) return false;
        } else if (filters.quickDate === 'This Year') {
          const ys = new Date(now.getFullYear(), 0, 1);
          const ye = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
          if (leadDate < ys || leadDate > ye) return false;
        }
      }

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (lead.name && lead.name.toLowerCase().includes(q)) ||
          (lead.mobile && lead.mobile.toLowerCase().includes(q)) ||
          (lead.project && lead.project.toLowerCase().includes(q));
      }
      return true;
    });

    result.sort((a, b) => {
      let aVal = a[sortConfig.key] || '';
      let bVal = b[sortConfig.key] || '';
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [leadsData, filters, searchQuery, sortConfig, activeTab, followUpSubTab]);

  const totalPages = Math.ceil(filteredAndSortedLeads.length / itemsPerPage);
  const currentLeads = filteredAndSortedLeads.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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

  const downloadMockFile = (type) => {
    const element = document.createElement("a");
    const file = new Blob([`Mock ${type} data for leads`], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `leads.${type.toLowerCase()}`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
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
      try {
        await Promise.all(selectedLeads.map(id =>
          fetch(`/api/leads/${id}`, { method: 'DELETE' })
        ));
        setSelectedLeads([]);
        fetchLeads(); // refresh the list
      } catch (err) {
        console.error('Failed to delete leads', err);
      }
    }
  };

  const handleCreateLead = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    const newLead = {
      name: formData.get('fullName') || '',
      email: formData.get('email') || '',
      mobile: `+91 ${formData.get('mobile') || ''}`,
      primarySource: formData.get('primarySource') !== 'Select Primary Source' ? formData.get('primarySource') : '',
      secondarySource: formData.get('secondarySource') !== 'Select Secondary Source' ? formData.get('secondarySource') : '',
      tertiarySource: formData.get('tertiarySource') !== 'Select Tertiary Source' ? formData.get('tertiarySource') : '',
      channelPartnerName: (formData.get('primarySource') || '').toLowerCase() === 'channel partner' ? (formData.get('channelPartnerName') || '') : '',
      project: formData.get('project') || '',
      status: 'New Lead',
      owner: localStorage.getItem('loggedInUser') || 'admin',
    };

    setIsSubmitting(true);
    // 3 seconds delay
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLead)
      });
      if (response.ok) {
        const createdLead = await response.json();
        setLeadsData([{
          ...createdLead,
          id: createdLead.id,
          primary: createdLead.primarySource,
          secondary: createdLead.secondarySource,
          date: formatDateString(createdLead.createdAt),
          formattedCreatedAt: formatDateString(createdLead.createdAt),
          formattedUpdatedAt: formatDateString(createdLead.updatedAt || createdLead.createdAt),
          createdAt: new Date(createdLead.createdAt).getTime(),
          updatedAt: new Date(createdLead.updatedAt || createdLead.createdAt).getTime()
        }, ...leadsData]);
        setIsModalOpen(false);
        setSelectedPrimarySource('');
        setCpSearchTerm('');
        setIsCpDropdownOpen(false);
        // Show toast: duplicate or success
        if (createdLead.status === 'Duplicate') {
          showToast('duplicate', `Duplicate lead found! ${createdLead.name} already exists with same mobile & project.`);
        } else {
          showToast('success', 'Form submitted successfully!');
        }
      } else {
        try {
          const errorData = await response.json();
          showToast('error', 'Failed to create lead: ' + (errorData.message || errorData.error || 'Unknown error'));
        } catch (e) {
          showToast('error', 'Failed to create lead. Server responded with status ' + response.status);
        }
      }
    } catch (err) {
      console.error('Failed to create lead', err);
      showToast('error', 'Failed to create lead. Please check if the backend server is running.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF('landscape');
    doc.text("Leads", 14, 15);
    const tableColumn = ["ID", "Name", "Mobile", "Primary", "Secondary", "Projects", "Status", "Remarks"];
    const tableRows = [];
    filteredAndSortedLeads.forEach((lead) => {
      tableRows.push([
        lead.id ? lead.id : "-",
        lead.name || "-",
        lead.mobile || "-",
        lead.primary || "-",
        lead.secondary || "-",
        lead.project || "-",
        lead.status || "-",
        lead.remarks || "-"
      ]);
    });
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });
    doc.save(`leads_${Date.now()}.pdf`);
  };

  const exportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Name,Mobile,Primary,Secondary,Projects,Status,Remarks,Owner,Created Date\n";
    filteredAndSortedLeads.forEach(lead => {
      let row = [
        lead.id ? lead.id : "-",
        lead.name || "-",
        lead.mobile || "-",
        lead.primary || "-",
        lead.secondary || "-",
        lead.project || "-",
        lead.status || "-",
        lead.remarks || "-",
        lead.ownerName || lead.owner || "-",
        lead.date || "-"
      ];
      csvContent += row.map(v => `"${v}"`).join(",") + "\n";
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "leads.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  const getTabCount = (tabName) => {
    switch (tabName) {
      case 'All':
      case 'All Leads':
        return leadsData.filter(lead => ['New Lead', 'Attempted', 'Interested'].includes(lead.status)).length;
      case 'Our Leads':
        return leadsData.filter(lead => ['New Lead', 'Attempted', 'Interested'].includes(lead.status) && lead.owner === loggedInUser).length;
      case 'Duplicate Leads':
        return leadsData.filter(lead => lead.status === 'Duplicate').length;
      case 'Rejected Leads':
        return leadsData.filter(lead => lead.status === 'Rejected').length;
      case 'Site Visit':
        return leadsData.filter(lead => lead.status === 'Site Visit').length;
      case 'Follow Up Leads':
        return leadsData.filter(lead => lead.followUpDate).length;
      default:
        return 0;
    }
  };

  const renderTabBadge = (tab) => {
    const count = getTabCount(tab);

    let badgeStyle = {
      marginLeft: '8px',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: '600'
    };

    switch (tab) {
      case 'All':
      case 'All Leads':
        badgeStyle = { ...badgeStyle, backgroundColor: '#3b82f6', color: 'white' };
        break;
      case 'Duplicate Leads':
        badgeStyle = { ...badgeStyle, backgroundColor: '#fbbf24', color: 'black' };
        break;
      case 'Rejected Leads':
        badgeStyle = { ...badgeStyle, backgroundColor: '#ef4444', color: 'white' };
        break;
      case 'Site Visit':
        badgeStyle = { ...badgeStyle, backgroundColor: '#10b981', color: 'white' };
        break;
      case 'Follow Up Leads':
        badgeStyle = { ...badgeStyle, backgroundColor: '#f97316', color: 'white' };
        break;
      case 'Our Leads':
        badgeStyle = { ...badgeStyle, backgroundColor: '#8c6cf5', color: 'white' };
        break;
      default:
        badgeStyle = { ...badgeStyle, backgroundColor: '#e2e8f0', color: '#475569' };
    }

    return <span style={badgeStyle}>{count}</span>;
  };

  const getSubTabCounts = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const nextDay = new Date(tomorrow);
    nextDay.setDate(nextDay.getDate() + 1);

    let missed = 0;
    let tomorrowCount = 0;
    let followUp = 0;

    leadsData.forEach(lead => {
      if (!lead.followUpDate) return;
      const d = new Date(lead.followUpDate);
      if (isNaN(d.getTime())) return;

      if (d < today) {
        // Past date → Missed Follow Up
        missed++;
      } else if (d >= tomorrow && d < nextDay) {
        // Exactly tomorrow → Tomorrow Follow Up
        tomorrowCount++;
      } else {
        // Today or 2+ days from now → Follow Up
        followUp++;
      }
    });

    return { missed, tomorrow: tomorrowCount, followUp };
  }, [leadsData]);

  React.useEffect(() => {
    if (activeTab === 'Follow Up Leads') {
      if (getSubTabCounts.missed > 0 && getSubTabCounts.followUp === 0 && getSubTabCounts.tomorrow === 0) {
        setFollowUpSubTab('Missed Follow Up');
      } else if (getSubTabCounts.tomorrow > 0 && getSubTabCounts.followUp === 0 && getSubTabCounts.missed === 0) {
        setFollowUpSubTab('Tomorrow Follow Up');
      }
    }
  }, [activeTab, getSubTabCounts]);
  const tableColumns = [
    visibleColumns.name && { key: 'name', header: 'Name', sortable: true },
    visibleColumns.mobile && {
      key: 'mobile', header: 'Mobile', sortable: true, cellStyle: { display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' },
      renderCell: (row) => (
        <>
          <span>{row.mobile}</span>
          <button className="btn-action edit-solid" onClick={() => window.location.href = `tel:${row.mobile}`}>
            <Phone size={14} color="white" />
          </button>
        </>
      )
    },
    visibleColumns.primary && { key: 'primary', header: 'Primary', sortable: true },
    visibleColumns.secondary && { key: 'secondary', header: 'Secondary', sortable: true },
    visibleColumns.project && { key: 'project', header: 'Projects', sortable: true },
    visibleColumns.status && {
      key: 'status', header: 'Status', sortable: true, cellStyle: { display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' },
      renderCell: (row) => (
        <>
          <span>{row.status}</span>
          {canEditOnTab && (
            <button className="btn-action edit-solid" onClick={() => setStatusModalLeadId(row.id)}>
              <Edit2 size={14} color="white" />
            </button>
          )}
        </>
      )
    },
    visibleColumns.remarks && {
      key: 'remarks', header: 'Remarks', sortable: false,
      renderCell: (row) => (
        <div className="action-buttons" style={{ display: 'flex', justifyContent: 'center' }}>
          <button className="btn-action message-outline" onClick={() => setRemarksModalLeadId(row.id)}>
            <MessageSquare size={14} color="#8c6cf5" />
          </button>
        </div>
      )
    },
    visibleColumns.owner && { key: 'owner', header: 'Owner', sortable: true, renderCell: (row) => row.ownerName || row.owner },
    visibleColumns.createdAt && { key: 'createdAt', header: 'Created Date', sortable: true, renderCell: (row) => row.formattedCreatedAt },
    visibleColumns.updatedAt && { key: 'updatedAt', header: 'Updated Date', sortable: true, renderCell: (row) => row.formattedUpdatedAt }
  ].filter(Boolean);

  const renderRowActions = (row) => (
    canEditOnTab && (
      <button className="btn-action edit-solid" onClick={() => navigate(`/leads/${row.id}`)}>
        <Edit2 size={14} color="white" />
      </button>
    )
  );

  return (
    <div className="leads-page">
      <div className="leads-header">
        <h2>Leads</h2>
        <div className="page-breadcrumb">
          <Home size={14} style={{ cursor: 'pointer' }} onClick={() => navigate('/')} /> <span className="slash">/</span> <span className="current">Add & Manage Leads</span>
        </div>
      </div>

      <div className="leads-card">
        {/* Tabs UI */}
        <div style={{ display: 'flex', gap: '10px', padding: '15px 20px', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => handleTabClick(tab)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 16px',
                border: 'none',
                background: activeTab === tab ? '#8c6cf5' : '#f1f5f9',
                color: activeTab === tab ? 'white' : '#475569',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s'
              }}
            >
              {tab}
              {renderTabBadge(tab)}
            </button>
          ))}
        </div>

        {activeTab === 'Follow Up Leads' && (
          <div style={{ padding: '15px 20px 0 20px' }}>
            <div className="fl-tabs">
              <button
                className={`fl-tab ${followUpSubTab === 'Follow Up' ? 'active' : ''}`}
                onClick={() => { setFollowUpSubTab('Follow Up'); setCurrentPage(1); }}
              >
                <span className="fl-tab-icon"></span> Follow Up {getSubTabCounts.followUp > 0 && `(${getSubTabCounts.followUp})`}
              </button>
              <button
                className={`fl-tab ${followUpSubTab === 'Missed Follow Up' ? 'active' : ''}`}
                onClick={() => { setFollowUpSubTab('Missed Follow Up'); setCurrentPage(1); }}
              >
                <span className="fl-tab-icon"></span> Missed Follow Up {getSubTabCounts.missed > 0 && `(${getSubTabCounts.missed})`}
              </button>
              <button
                className={`fl-tab ${followUpSubTab === 'Tomorrow Follow Up' ? 'active' : ''}`}
                onClick={() => { setFollowUpSubTab('Tomorrow Follow Up'); setCurrentPage(1); }}
              >
                <span className="fl-tab-icon"></span> Tomorrow Follow Up {getSubTabCounts.tomorrow > 0 && `(${getSubTabCounts.tomorrow})`}
              </button>
            </div>
          </div>
        )}

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

            {hasExportPermission && (
              <>
                <button className="btn-export" style={{ backgroundColor: '#ffe6cc', color: '#a0522d', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }} onClick={exportCSV}>
                  <Download size={14} /> Export CSV
                </button>

                <button className="btn-export" style={{ backgroundColor: '#ffebee', color: '#b71c1c', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }} onClick={exportPDF}>
                  <Download size={14} /> Export PDF
                </button>
              </>
            )}
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
            <button className="btn-create" onClick={() => { setIsModalOpen(true); setCpSearchTerm(''); setIsCpDropdownOpen(false); }}>
              <Plus size={16} /> Create New Lead
            </button>
          </div>
        </div>

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
          totalItems={filteredAndSortedLeads.length}
          onPageChange={setCurrentPage}
          renderRowActions={renderRowActions}
          rowHighlightRule={(row, index) => index === 0 && currentPage === 1 && sortConfig.key === 'updatedAt' && sortConfig.direction === 'desc'}
        />
      </div>

      {/* Create Lead Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Create New Lead</h3>
              <button className="modal-close" onClick={() => { setIsModalOpen(false); setSelectedPrimarySource(''); setCpSearchTerm(''); setIsCpDropdownOpen(false); }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateLead}>
              <div className="modal-body">
                <div className="project-input-container">
                  <label>Project Interested</label>
                  <select name="project" className="project-input" required>
                    <option value="">Select Project</option>
                    {projectsList.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div className="form-grid">
                  <div className="form-column">
                    <div className="form-group">
                      <label>Full Name :</label>
                      <input type="text" name="fullName" placeholder="Full Name" required />
                    </div>
                    <div className="form-group">
                      <label>Email Address :</label>
                      <input type="email" name="email" placeholder="E-mail Id" required />
                    </div>
                    <div className="form-group">
                      <label>Mobile Number :</label>
                      <div className="mobile-input-wrapper">
                        <div className="country-dropdown">
                          <img src="https://flagcdn.com/w20/in.png" alt="IN" />
                          <span>+91</span>
                          <ChevronDown size={12} />
                        </div>
                        <input type="text" name="mobile" placeholder="Enter 10 Digit Number" maxlength="10" inputmode="numeric" required pattern="\d{10}" title="Enter exactly 10 digits" />
                      </div>
                    </div>
                  </div>

                  <div className="form-column">
                    <div className="form-group">
                      <label>Primary Source :</label>
                      <select
                        name="primarySource"
                        required
                        value={selectedPrimarySource}
                        onChange={(e) => setSelectedPrimarySource(e.target.value)}
                      >
                        <option value="">Select Primary Source</option>
                        {primarySources.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    {selectedPrimarySource && selectedPrimarySource.toLowerCase() === 'channel partner' && (
                      <div className="form-group" style={{ position: 'relative' }} ref={cpRef}>
                        <label>Channel Partner :</label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <input
                            type="text"
                            name="channelPartnerName"
                            placeholder="Channel Partner Name"
                            required
                            value={cpSearchTerm}
                            onChange={(e) => {
                              setCpSearchTerm(e.target.value);
                              setIsCpDropdownOpen(true);
                            }}
                            autoComplete="off"
                          />
                        </div>
                        {isCpDropdownOpen && filteredChannelPartners.length > 0 && (
                          <ul
                            className="custom-dropdown-list"
                            style={{
                              position: 'absolute',
                              top: '100%',
                              left: 0,
                              right: 0,
                              zIndex: 9999,
                              maxHeight: '150px',
                              overflowY: 'auto',
                              background: '#fff',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              marginTop: '2px',
                              boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                            }}
                          >
                            {filteredChannelPartners.map(partner => (
                              <li
                                key={partner.id}
                                onClick={() => {
                                  setCpSearchTerm(partner.ownerName || partner.companyName || '');
                                  setIsCpDropdownOpen(false);
                                }}
                                style={{
                                  padding: '8px 12px',
                                  fontSize: '13px',
                                  color: '#333',
                                  cursor: 'pointer',
                                  borderBottom: '1px solid #eee'
                                }}
                              >
                                {partner.ownerName}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    <div className="form-group">
                      <label>Secondary Source :</label>
                      <select name="secondarySource" required>
                        <option value="">Select Secondary Source</option>
                        {secondarySources.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>tertiary Source :</label>
                      <select name="tertiarySource" required>
                        <option value="">Select Tertiary Source</option>
                        {tertiarySources.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="submit" className="btn-create-lead" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Create Leads'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  {projectsList.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="filter-group">
                <label>Primary Source</label>
                <select name="primarySource" value={filters.primarySource} onChange={handleFilterChange}>
                  <option value="">Select options</option>
                  {primarySources.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="filter-group">
                <label>Lead Status</label>
                <select name="status" value={filters.status} onChange={handleFilterChange}>
                  <option value="">Select options</option>
                  {leadStatusList.map(s => (
                    <option key={s.id} value={s.statusName}>{s.statusName}</option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label>SV Status</label>
                <select name="svStatus" value={filters.svStatus} onChange={handleFilterChange}>
                  <option value="">Select options</option>
                  {svStatusList.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label>User</label>
                <select name="owner" value={filters.owner} onChange={handleFilterChange}>
                  <option value="">Select options</option>
                  {usersList.map(u => (
                    <option key={u.id || u.username} value={u.username}>
                      {u.firstName && u.lastName
                        ? `${u.firstName} ${u.lastName} (${u.username})`
                        : u.username}
                    </option>
                  ))}
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

      {/* Update Lead Status Modal */}
      {statusModalLeadId && (
        <div className="modal-overlay" style={{ position: 'fixed', zIndex: 9999, top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => {
          setStatusModalLeadId(null);
          setIsStatusDropdownOpen(false);
          setIsOpenReasonDropdownOpen(false);
          setIsCallStatusDropdownOpen(false);
          setIsRejectionTypeDropdownOpen(false);
        }}>
          <div className="status-modal-content" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: '#fff', padding: '0', borderRadius: '8px', width: '400px', overflow: 'visible' }}>
            <div className="status-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid #eee' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#333' }}>Update Lead Status</h3>
              <button className="modal-close" onClick={() => {
                setStatusModalLeadId(null);
                setIsStatusDropdownOpen(false);
                setIsOpenReasonDropdownOpen(false);
                setIsCallStatusDropdownOpen(false);
                setIsRejectionTypeDropdownOpen(false);
              }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <form className="status-modal-body" style={{ padding: '20px' }} onSubmit={async (e) => {
              e.preventDefault();
              setIsSubmitting(true);
              await new Promise(resolve => setTimeout(resolve, 3000));
              try {
                const payload = {};
                for (const key in modalFormState) {
                  if (modalFormState[key] !== '') payload[key] = modalFormState[key];
                }
                // Map allocateTo to owner field for backend storage
                if (payload.allocateTo) {
                  payload.owner = payload.allocateTo;
                  delete payload.allocateTo;
                }
                const response = await fetch(`/api/leads/${statusModalLeadId}/status`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
                });
                if (response.ok) {
                  const updatedLead = await response.json();
                  setLeadsData(leadsData.map(l => l.id === statusModalLeadId ? {
                    ...updatedLead,
                    id: updatedLead.id,
                    primary: updatedLead.primarySource,
                    secondary: updatedLead.secondarySource,
                    date: formatDateString(updatedLead.updatedAt || updatedLead.createdAt),
                    formattedCreatedAt: formatDateString(updatedLead.createdAt),
                    formattedUpdatedAt: formatDateString(updatedLead.updatedAt || updatedLead.createdAt),
                    createdAt: new Date(updatedLead.createdAt).getTime(),
                    updatedAt: new Date(updatedLead.updatedAt || updatedLead.createdAt).getTime()
                  } : l));
                  setStatusModalLeadId(null);
                  setIsStatusDropdownOpen(false);
                  setIsOpenReasonDropdownOpen(false);
                  setIsCallStatusDropdownOpen(false);
                  setIsRejectionTypeDropdownOpen(false);
                  showToast('success', `Lead status is updated as ${modalFormState.status} successfully`);
                }
              } catch (err) {
                console.error('Failed to update status', err);
              } finally {
                setIsSubmitting(false);
              }
            }}>
              <div className="status-form-group">
                <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '8px' }}>Enquiry Status:</label>
                <div className="custom-dropdown-container">
                  <div
                    className="custom-dropdown-header"
                    onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                  >
                    {modalFormState.status}
                    <ChevronDown size={14} />
                  </div>
                  {isStatusDropdownOpen && (
                    <ul className="custom-dropdown-list">
                      {(leadStatusList.length > 0 ? leadStatusList.map(s => s.statusName) : ['New Lead', 'Attempted', 'Interested', 'Rejected', 'Site Visit']).map(opt => (
                        <li
                          key={opt}
                          className={opt === modalFormState.status ? 'selected' : ''}
                          onClick={() => {
                            setModalFormState(prev => ({ ...prev, status: opt }));
                            setIsStatusDropdownOpen(false);
                          }}
                        >
                          {opt}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {modalFormState.status === 'Attempted' && (
                <>
                  <div className="status-form-group">
                    <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '8px' }}>Open Reason</label>
                    <div className="custom-dropdown-container">
                      <div
                        className="custom-dropdown-header"
                        onClick={() => setIsOpenReasonDropdownOpen(!isOpenReasonDropdownOpen)}
                      >
                        {modalFormState.openReason || 'Select Open Reason'}
                        <ChevronDown size={14} />
                      </div>
                      {isOpenReasonDropdownOpen && (
                        <ul className="custom-dropdown-list">
                          {['Busy', 'Not Reachable', 'Switched Off', 'Connected'].map(opt => (
                            <li
                              key={opt}
                              className={opt === modalFormState.openReason ? 'selected' : ''}
                              onClick={() => {
                                setModalFormState(prev => ({ ...prev, openReason: opt }));
                                setIsOpenReasonDropdownOpen(false);
                              }}
                            >
                              {opt}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="status-form-group">
                    <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '8px' }}>Call Status</label>
                    <div className="custom-dropdown-container">
                      <div
                        className="custom-dropdown-header"
                        onClick={() => setIsCallStatusDropdownOpen(!isCallStatusDropdownOpen)}
                      >
                        {modalFormState.callStatus || 'Select Call Status'}
                        <ChevronDown size={14} />
                      </div>
                      {isCallStatusDropdownOpen && (
                        <ul className="custom-dropdown-list">
                          {['Answered', 'No Answer', 'Follow Up Date'].map(opt => (
                            <li
                              key={opt}
                              className={opt === modalFormState.callStatus ? 'selected' : ''}
                              onClick={() => {
                                setModalFormState(prev => ({ ...prev, callStatus: opt }));
                                setIsCallStatusDropdownOpen(false);
                              }}
                            >
                              {opt}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </>
              )}

              {(modalFormState.callStatus === 'Follow Up Date' || modalFormState.status === 'Interested') && (
                <div className="status-form-group">
                  <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '8px' }}>Follow Up Date</label>
                  <input
                    type="datetime-local"
                    className="status-input-dashed"
                    value={modalFormState.followUpDate}
                    onChange={(e) => setModalFormState(prev => ({ ...prev, followUpDate: e.target.value }))}
                    required
                  />
                </div>
              )}

              {(modalFormState.status === 'Attempted' || modalFormState.status === 'Interested') && (
                <div className="status-form-group">
                  <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '8px' }}>Call Remarks</label>
                  <textarea
                    className="status-input-dashed"
                    placeholder="Enter remarks..."
                    value={modalFormState.callRemarks}
                    onChange={(e) => setModalFormState(prev => ({ ...prev, callRemarks: e.target.value }))}
                  ></textarea>
                </div>
              )}

              {modalFormState.status === 'Rejected' && (
                <>
                  <div className="status-form-group">
                    <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '8px' }}>Rejection Type</label>
                    <div className="custom-dropdown-container">
                      <div
                        className="custom-dropdown-header"
                        onClick={() => setIsRejectionTypeDropdownOpen(!isRejectionTypeDropdownOpen)}
                      >
                        {modalFormState.rejectionType || 'Select Rejection Type'}
                        <ChevronDown size={14} />
                      </div>
                      {isRejectionTypeDropdownOpen && (
                        <ul className="custom-dropdown-list">
                          {['Not Interested', 'Budget Constraints', 'Competitor Chosen', 'Invalid Lead', 'Other'].map(opt => (
                            <li
                              key={opt}
                              className={opt === modalFormState.rejectionType ? 'selected' : ''}
                              onClick={() => {
                                setModalFormState(prev => ({ ...prev, rejectionType: opt }));
                                setIsRejectionTypeDropdownOpen(false);
                              }}
                            >
                              {opt}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {modalFormState.rejectionType === 'Not Interested' && (
                    <div className="status-form-group">
                      <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '8px' }}>Reason Details</label>
                      <textarea
                        className="status-input-dashed"
                        placeholder="Why not interested?"
                        value={modalFormState.reasonDetails}
                        onChange={(e) => setModalFormState(prev => ({ ...prev, reasonDetails: e.target.value }))}
                      ></textarea>
                    </div>
                  )}

                  {modalFormState.rejectionType === 'Budget Constraints' && (
                    <div className="status-form-group">
                      <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '8px' }}>Budget Limit</label>
                      <input
                        type="text"
                        className="status-input-dashed"
                        placeholder="Enter budget limit"
                        value={modalFormState.budgetLimit}
                        onChange={(e) => setModalFormState(prev => ({ ...prev, budgetLimit: e.target.value }))}
                      />
                    </div>
                  )}

                  {modalFormState.rejectionType === 'Competitor Chosen' && (
                    <>
                      <div className="status-form-group">
                        <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '8px' }}>Competitor Name</label>
                        <input
                          type="text"
                          className="status-input-dashed"
                          placeholder="Enter competitor name"
                          value={modalFormState.competitorName}
                          onChange={(e) => setModalFormState(prev => ({ ...prev, competitorName: e.target.value }))}
                        />
                      </div>
                      <div className="status-form-group">
                        <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '8px' }}>Competitor Offer</label>
                        <input
                          type="text"
                          className="status-input-dashed"
                          placeholder="Enter competitor offer"
                          value={modalFormState.competitorOffer}
                          onChange={(e) => setModalFormState(prev => ({ ...prev, competitorOffer: e.target.value }))}
                        />
                      </div>
                    </>
                  )}

                  {modalFormState.rejectionType === 'Invalid Lead' && (
                    <div className="status-form-group">
                      <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '8px' }}>Reason for Invalidity</label>
                      <input
                        type="text"
                        className="status-input-dashed"
                        placeholder="Enter reason"
                        value={modalFormState.invalidReason}
                        onChange={(e) => setModalFormState(prev => ({ ...prev, invalidReason: e.target.value }))}
                      />
                    </div>
                  )}

                  {modalFormState.rejectionType === 'Other' && (
                    <div className="status-form-group">
                      <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '8px' }}>Other Notes</label>
                      <textarea
                        className="status-input-dashed"
                        placeholder="Enter other notes"
                        value={modalFormState.otherNotes}
                        onChange={(e) => setModalFormState(prev => ({ ...prev, otherNotes: e.target.value }))}
                      ></textarea>
                    </div>
                  )}

                  <div className="status-form-group">
                    <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '8px' }}>Additional Remarks</label>
                    <textarea
                      className="status-input-dashed"
                      placeholder="Enter remarks"
                      value={modalFormState.additionalRemarks}
                      onChange={(e) => setModalFormState(prev => ({ ...prev, additionalRemarks: e.target.value }))}
                    ></textarea>
                  </div>
                </>
              )}

              {modalFormState.status === 'Site Visit' && (
                <>
                  <div className="status-form-group">
                    <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '8px' }}>Site Visit Scheduled Date :</label>
                    <input
                      type="datetime-local"
                      className="status-input-dashed"
                      value={modalFormState.siteVisitDate}
                      onChange={(e) => setModalFormState(prev => ({ ...prev, siteVisitDate: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="status-form-group">
                    <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '8px' }}>Note</label>
                    <textarea
                      className="status-input-dashed"
                      placeholder="Note"
                      value={modalFormState.siteVisitNote}
                      onChange={(e) => setModalFormState(prev => ({ ...prev, siteVisitNote: e.target.value }))}
                    ></textarea>
                  </div>
                </>
              )}

              {modalFormState.status === 'Allocate' && (
                <>
                  <div className="status-form-group">
                    <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '8px' }}>Allocate To :</label>
                    <select
                      className="status-input-dashed"
                      value={modalFormState.allocateTo}
                      onChange={(e) => setModalFormState(prev => ({ ...prev, allocateTo: e.target.value }))}
                    >
                      <option value="">Select User</option>
                      {usersList.map(u => (
                        <option key={u.id} value={u.username || u.id}>
                          {u.firstName && u.lastName ? `${u.firstName} ${u.lastName} (${u.username})` : (u.username || u.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="status-form-group">
                    <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '8px' }}>Target Date :</label>
                    <input
                      type="datetime-local"
                      className="status-input-dashed"
                      value={modalFormState.followUpDate}
                      onChange={(e) => setModalFormState(prev => ({ ...prev, followUpDate: e.target.value }))}
                    />
                  </div>
                  <div className="status-form-group">
                    <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '8px' }}>Allocation Notes :</label>
                    <textarea
                      className="status-input-dashed"
                      rows="3"
                      placeholder="Enter allocation notes..."
                      value={modalFormState.additionalRemarks}
                      onChange={(e) => setModalFormState(prev => ({ ...prev, additionalRemarks: e.target.value }))}
                    ></textarea>
                  </div>
                </>
              )}

              {modalFormState.status !== 'New Lead' && (
                <div style={{ overflow: 'hidden', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    className="status-submit-btn"
                    style={{ display: 'flex', alignItems: 'center' }}
                    disabled={isSubmitting}
                  >
                    <RefreshCw size={14} style={{ marginRight: '6px' }} />
                    {isSubmitting ? 'Submitting...' : 'Submit Changes'}
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
      {/* Toast Notification */}
      {toast.visible && (
        <div className={`leads-toast leads-toast-${toast.type}`}>
          <div className="leads-toast-icon">
            {toast.type === 'success' && <Check size={20} />}
            {toast.type === 'duplicate' && <AlertTriangle size={20} />}
            {toast.type === 'error' && <X size={20} />}
          </div>
          <span className="leads-toast-message">{toast.message}</span>
          <button className="leads-toast-close" onClick={() => setToast({ visible: false, type: '', message: '' })}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
