import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import {
  User, Calendar, Phone, Star, CheckCircle, XCircle, Copy, Briefcase,
  AlertCircle, ChevronDown, Search, X, ArrowLeft
} from 'lucide-react';
import './Dashboard.css';

const statConfig = {
  'Today Leads':          { icon: <Calendar size={20} color="#fff" />, color: '#4a72ff' },
  'New Lead':             { icon: <User size={20} color="#fff" />, color: '#00c37b' },
  'Attempted':            { icon: <Phone size={20} color="#fff" />, color: '#6c757d' },
  'Interested':           { icon: <Star size={20} color="#fff" />, color: '#ffb822' },
  'Allocate':             { icon: <User size={20} color="#fff" />, color: '#00b5e9' },
  'Site Visit':           { icon: <Calendar size={20} color="#fff" />, color: '#4a72ff', path: '/site-visits' },
  'Rejected':             { icon: <XCircle size={20} color="#fff" />, color: '#ff3d60', path: '/rejected-leads' },
  'Duplicate':            { icon: <Copy size={20} color="#fff" />, color: '#6c757d' },
  'Opportunity':          { icon: <Briefcase size={20} color="#fff" />, color: '#00c37b' },
  'Missed Follow Up':     { icon: <AlertCircle size={20} color="#fff" />, color: '#ffb822' },
  'Site Visit Done':      { icon: <CheckCircle size={20} color="#fff" />, color: '#00c37b' },
  'Site Visit Confirmed': { icon: <CheckCircle size={20} color="#fff" />, color: '#4a72ff' },
  'Re Scheduled Visit':   { icon: <Calendar size={20} color="#fff" />, color: '#ffb822' },
  'Site Visit Scheduled': { icon: <Calendar size={20} color="#fff" />, color: '#4a72ff' },
};

const PIE_COLORS = ['#8884d8', '#ff3d60', '#ffc658', '#00c37b', '#00b5e9', '#e91e63'];

// ─── Role helpers ─────────────────────────────────────────────────────────────

/** Map a logged-in user's status to their home dashboard view. */
const getHomeView = (isSuperAdmin, status) => {
  if (isSuperAdmin) return 'Superadmin';
  if (status === 'Admin')   return 'Admin';
  if (status === 'Manager') return 'Manager';
  return 'Employee';
};

/**
 * Sub-views the user can browse to from their home view.
 * The home view itself is NOT listed — it's always accessible via the Back button.
 */
const getDropdownOptions = (homeView) => {
  if (homeView === 'Superadmin') return ['Admin', 'Manager', 'Employee'];
  if (homeView === 'Admin')      return ['Manager', 'Employee'];
  if (homeView === 'Manager')    return ['Employee'];
  return []; // Employee / User — no sub-views
};

/** Which user statuses the search should return for a given dashboard view. */
const getSearchStatus = (view) => {
  if (view === 'Admin')   return 'Admin';
  if (view === 'Manager') return 'Manager';
  return 'Employee';
};

/** Search input placeholder text for a given dashboard view. */
const getSearchPlaceholder = (view) => {
  if (view === 'Admin')   return 'Search admins by name or username...';
  if (view === 'Manager') return 'Search managers by name or username...';
  return 'Search employees by name or username...';
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardOverview() {
  const navigate = useNavigate();
  const loggedInUser        = localStorage.getItem('loggedInUser') || '';
  const isSuperAdmin        = loggedInUser === 'admin';
  const userStatusFromStorage = localStorage.getItem('userStatus') || '';

  // ── Role / home view ─────────────────────────────────────────────────────
  const [userRole,  setUserRole]  = useState(isSuperAdmin ? 'Superadmin' : (userStatusFromStorage || 'Employee'));
  const [homeView,  setHomeView]  = useState(getHomeView(isSuperAdmin, userStatusFromStorage));

  // ── Current dashboard view (starts at home) ───────────────────────────────
  const [dashboardView, setDashboardView] = useState(getHomeView(isSuperAdmin, userStatusFromStorage));

  // ── Project filter ────────────────────────────────────────────────────────
  const [projects,         setProjects]         = useState([]);
  const [selectedProject,  setSelectedProject]  = useState('All Projects');
  const [isDropdownOpen,   setIsDropdownOpen]   = useState(false);
  const dropdownRef = useRef(null);

  // ── Dashboard data ────────────────────────────────────────────────────────
  const [dashboardData, setDashboardData] = useState(null);
  const [loading,       setLoading]       = useState(true);

  // ── Dashboard-view dropdown ───────────────────────────────────────────────
  const [isDashDropdownOpen, setIsDashDropdownOpen] = useState(false);
  const dashDropdownRef = useRef(null);

  // ── Specific user (from search) ───────────────────────────────────────────
  const [specificUser,    setSpecificUser]    = useState('');
  const [selectedUserInfo, setSelectedUserInfo] = useState(null);

  // ── Search ────────────────────────────────────────────────────────────────
  const [searchQuery,       setSearchQuery]       = useState('');
  const [searchResults,     setSearchResults]     = useState([]);
  const [searchLoading,     setSearchLoading]     = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchError,       setSearchError]       = useState('');
  const searchRef    = useRef(null);
  const debounceTimer = useRef(null);

  // ── Fetch true user role on mount ─────────────────────────────────────────
  useEffect(() => {
    if (loggedInUser && !isSuperAdmin) {
      fetch(`/api/users/username/${loggedInUser}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.status) {
            const status = data.status;
            setUserRole(status);
            const home = getHomeView(false, status);
            setHomeView(home);
            setDashboardView(home);
            localStorage.setItem('userStatus', status);
          }
        })
        .catch(err => console.error('Failed to fetch user role:', err));
    }
  }, [loggedInUser, isSuperAdmin]);

  // ── Outside-click handlers + project fetch ────────────────────────────────
  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(data => setProjects(Array.isArray(data) ? data : []))
      .catch(err => console.error('Error fetching projects:', err));

    const handleClickOutside = (e) => {
      if (dropdownRef.current     && !dropdownRef.current.contains(e.target))     setIsDropdownOpen(false);
      if (dashDropdownRef.current && !dashDropdownRef.current.contains(e.target)) setIsDashDropdownOpen(false);
      if (searchRef.current       && !searchRef.current.contains(e.target))       setShowSearchResults(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Debounced search (scoped to current dashboardView) ────────────────────
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 1) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError('');
      try {
        const statusParam = getSearchStatus(dashboardView);
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}&status=${statusParam}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
          setShowSearchResults(true);
        } else {
          setSearchError('Search failed');
        }
      } catch (err) {
        setSearchError('Error searching users');
        console.error('Error searching users:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [searchQuery, dashboardView]);

  // ── Fetch dashboard stats ─────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    let url = `/api/dashboard?username=${encodeURIComponent(loggedInUser)}&viewAsRole=${dashboardView}`;
    if (specificUser)                       url += `&specificUser=${encodeURIComponent(specificUser)}`;
    if (selectedProject !== 'All Projects') url += `&project=${encodeURIComponent(selectedProject)}`;
    fetch(url)
      .then(res => res.json())
      .then(data  => { setDashboardData(data);  setLoading(false); })
      .catch(err  => { console.error('Error fetching dashboard data:', err); setLoading(false); });
  }, [selectedProject, dashboardView, specificUser, loggedInUser]);

  // ── Derived values ────────────────────────────────────────────────────────
  const dropdownOptions  = getDropdownOptions(homeView);
  const isOnNonHomeView  = dashboardView !== homeView;
  // Show search bar only when browsing a non-home sub-view
  const showSearchBar    = isOnNonHomeView;

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Switch to a sub-view from the dropdown. */
  const handleViewSwitch = (view) => {
    setDashboardView(view);
    setSpecificUser('');
    setSelectedUserInfo(null);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
    setIsDashDropdownOpen(false);
  };

  /** Go back to home view, clearing any specific-user filter. */
  const handleBack = () => {
    setDashboardView(homeView);
    setSpecificUser('');
    setSelectedUserInfo(null);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
  };

  /** Select a user from the search dropdown (stays on current view). */
  const handleUserSelect = (user) => {
    setShowSearchResults(false);
    setSearchQuery('');
    setSpecificUser(user.username);
    setSelectedUserInfo({
      username:  user.username,
      firstName: user.firstName,
      lastName:  user.lastName,
      status:    user.status
    });
  };

  /** Clear specific-user filter (stay on current view). */
  const clearSpecificUser = () => {
    setSpecificUser('');
    setSelectedUserInfo(null);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
  };

  const selectProject = (name) => {
    setSelectedProject(name);
    setIsDropdownOpen(false);
  };

  // ── Chart / stats data ────────────────────────────────────────────────────
  const projectStats = dashboardData
    ? Object.keys(statConfig).map(name => {
        let count = 0;
        if (name === 'Today Leads')  count = dashboardData.todayLeads   || 0;
        else if (name === 'Opportunity') count = dashboardData.opportunities || 0;
        else count = (dashboardData.leadStats && dashboardData.leadStats[name]) || 0;
        return { name, count, ...statConfig[name] };
      })
    : [];

  const leadInsightsData = dashboardData
    ? (dashboardData.leadInsights || []).map((item, i) => ({
        name:  item.primarySource || 'Unknown',
        value: item._count.id,
        fill:  PIE_COLORS[i % PIE_COLORS.length],
      }))
    : [];
  const totalLeads = leadInsightsData.reduce((a, c) => a + c.value, 0);

  const siteVisitsInsightsData = dashboardData
    ? (dashboardData.siteVisitsInsights || []).map((item, i) => ({
        name:  item.primarySource || 'Unknown',
        value: item._count.id,
        fill:  PIE_COLORS[i % PIE_COLORS.length],
      }))
    : [];
  const totalSiteVisits = siteVisitsInsightsData.reduce((a, c) => a + c.value, 0);

  // Dashboard title
  const dashboardTitle = selectedUserInfo
    ? `${selectedUserInfo.firstName || selectedUserInfo.username}${selectedUserInfo.lastName ? ` ${selectedUserInfo.lastName}` : ''}'s Dashboard`
    : `${dashboardView} Dashboard`;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="dashboard-body">

      {/* ── Title row ──────────────────────────────────────────────────────── */}
      <div
        className="dashboard-header-title-row"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '0 5px' }}
      >
        {/* Left: Back button + title (with dropdown when on home) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

          {/* Back button — shown whenever user is not on their home view */}
          {isOnNonHomeView && (
            <button
              onClick={handleBack}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px',
                padding: '8px 14px', cursor: 'pointer', fontSize: '13px',
                color: '#475569', fontWeight: '500', whiteSpace: 'nowrap',
                transition: 'all 0.18s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#1e293b'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#475569'; }}
            >
              <ArrowLeft size={14} />
              Back to {homeView} Dashboard
            </button>
          )}

          {/* Dashboard title — dropdown only when on home view and options exist */}
          <div ref={dashDropdownRef} style={{ position: 'relative' }}>
            <h2
              onClick={() => {
                if (!isOnNonHomeView && dropdownOptions.length > 0) {
                  setIsDashDropdownOpen(prev => !prev);
                }
              }}
              style={{
                cursor: !isOnNonHomeView && dropdownOptions.length > 0 ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', gap: '8px',
                margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#1e293b',
              }}
            >
              {dashboardTitle}
              {!isOnNonHomeView && dropdownOptions.length > 0 && <ChevronDown size={20} />}
            </h2>

            {isDashDropdownOpen && !isOnNonHomeView && dropdownOptions.length > 0 && (
              <ul
                style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: '8px',
                  background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.12)', zIndex: 100,
                  padding: '6px 0', margin: 0, listStyle: 'none', minWidth: '220px',
                }}
              >
                {dropdownOptions.map(view => (
                  <li
                    key={view}
                    onClick={() => handleViewSwitch(view)}
                    style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '14px', color: '#334155' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {view} Dashboard
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: Scoped search bar — only on non-home views */}
        {showSearchBar && (
          <div className="dashboard-user-search" ref={searchRef}>
            <div className="dashboard-user-search-input-wrapper">
              <Search size={18} className="dashboard-user-search-icon" />
              <input
                type="text"
                className="dashboard-user-search-input"
                placeholder={getSearchPlaceholder(dashboardView)}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => { if (searchResults.length > 0) setShowSearchResults(true); }}
              />
              {searchLoading && <span className="dashboard-user-search-spinner" />}
              {searchQuery && !searchLoading && (
                <button className="dashboard-user-search-clear" onClick={clearSearch}>
                  <X size={16} />
                </button>
              )}
            </div>

            {showSearchResults && (
              <div className="dashboard-user-search-results">
                {searchError && (
                  <div className="dashboard-user-search-error">{searchError}</div>
                )}
                {!searchError && searchResults.length === 0 && (
                  <div className="dashboard-user-search-empty">No users found</div>
                )}
                {searchResults.map(user => (
                  <div
                    key={user.id}
                    className="dashboard-user-search-result-item"
                    onClick={() => handleUserSelect(user)}
                  >
                    <div className="dashboard-user-search-result-avatar">
                      {(user.firstName?.[0] || user.username?.[0] || '?').toUpperCase()}
                    </div>
                    <div className="dashboard-user-search-result-info">
                      <span className="dashboard-user-search-result-name">
                        {user.firstName || user.username}
                        {user.lastName ? ` ${user.lastName}` : ''}
                      </span>
                      <span className="dashboard-user-search-result-meta">
                        {user.username} · {user.status || 'N/A'} · {user.email || '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Specific-user banner ────────────────────────────────────────────── */}
      {selectedUserInfo && (
        <div className="specific-user-banner">
          <div className="specific-user-banner-info">
            <div className="specific-user-banner-avatar">
              {(selectedUserInfo.firstName?.[0] || selectedUserInfo.username?.[0] || '?').toUpperCase()}
            </div>
            <div className="specific-user-banner-details">
              <span className="specific-user-banner-name">
                {selectedUserInfo.firstName || selectedUserInfo.username}
                {selectedUserInfo.lastName ? ` ${selectedUserInfo.lastName}` : ''}
              </span>
              <span className="specific-user-banner-meta">
                @{selectedUserInfo.username} · {selectedUserInfo.status}
              </span>
            </div>
          </div>
          <button className="specific-user-banner-clear" onClick={clearSpecificUser}>
            <X size={16} />
            <span>Back to {dashboardView} Dashboard</span>
          </button>
        </div>
      )}

      {/* ── Dashboard content: show only on home view OR when a specific user is selected ── */}
      {(!isOnNonHomeView || specificUser) ? (
        <>
          {/* ── Project Status section ──────────────────────────────────────────── */}
          <section className="dashboard-card project-status-section">
            <div className="card-header">
              <h3>Project Status</h3>

              <div className="project-dropdown-container" ref={dropdownRef}>
                <button
                  className={`project-dropdown-toggle${isDropdownOpen ? ' open' : ''}`}
                  onClick={() => setIsDropdownOpen(prev => !prev)}
                >
                  <span>{selectedProject}</span>
                  <ChevronDown
                    size={14}
                    style={{ transition: 'transform 0.2s', transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
                  />
                </button>

                {isDropdownOpen && (
                  <ul className="project-dropdown-menu">
                    <li
                      className={selectedProject === 'All Projects' ? 'active' : ''}
                      onClick={() => selectProject('All Projects')}
                    >
                      All Projects
                    </li>
                    {projects.map(p => (
                      <li
                        key={p.id}
                        className={selectedProject === p.projectName ? 'active' : ''}
                        onClick={() => selectProject(p.projectName)}
                      >
                        {p.projectName}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {loading ? (
              <div className="dashboard-loading">Loading data…</div>
            ) : (
              <div className="stats-grid">
                {projectStats.map((stat, i) => (
                  <div
                    key={i}
                    className="stat-card"
                    style={{ borderBottomColor: stat.color, cursor: stat.path ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (stat.path === '/rejected-leads') window.location.href = stat.path;
                      else if (stat.path) navigate(stat.path);
                    }}
                  >
                    <div className="stat-icon" style={{ backgroundColor: stat.color }}>{stat.icon}</div>
                    <div className="stat-info">
                      <span className="stat-name">{stat.name}</span>
                      <span className="stat-count">{stat.count}</span>
                    </div>
                    <div className="stat-footer">
                      <span style={{ color: stat.color, cursor: 'pointer', fontWeight: 600 }}>VIEW DETAILS &rarr;</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Bottom grid ─────────────────────────────────────────────────────── */}
          <div className="bottom-grid">

            {/* Lead Insights */}
            <section className="dashboard-card chart-card">
              <h3>Lead Insights</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={leadInsightsData} innerRadius={50} outerRadius={70} dataKey="value" stroke="none">
                      {leadInsightsData.map((entry, idx) => (
                        <Cell key={`li-${idx}`} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="chart-center-text">
                  <div className="count">{totalLeads}</div>
                  <div className="label">Total Leads</div>
                </div>
              </div>
              <ul className="chart-legend">
                {leadInsightsData.map((item, idx) => (
                  <li key={idx}>
                    <span>{item.name}</span>
                    <span className="val">{item.value}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* SiteVisits Insights */}
            <section className="dashboard-card chart-card">
              <h3>SiteVisits Insights</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={siteVisitsInsightsData} innerRadius={50} outerRadius={70} dataKey="value" stroke="none">
                      {siteVisitsInsightsData.map((entry, idx) => (
                        <Cell key={`sv-${idx}`} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="chart-center-text">
                  <div className="count">{totalSiteVisits}</div>
                  <div className="label">Total SV</div>
                </div>
              </div>
              <ul className="chart-legend">
                {siteVisitsInsightsData.map((item, idx) => (
                  <li key={idx}>
                    <span>{item.name}</span>
                    <span className="val">{item.value}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Digit Lead Stats */}
            <section className="dashboard-card table-card">
              <h3>Digit Lead Stats</h3>
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Tertiary</th>
                      <th>Total Lead</th>
                      <th>Total Open Lead</th>
                      <th>Total Reject Lead</th>
                      <th>%TOP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardData && dashboardData.digitLeadStats && dashboardData.digitLeadStats.length > 0 ? (
                      dashboardData.digitLeadStats.map((row, idx) => (
                        <tr key={idx}>
                          <td>{row.source}</td>
                          <td>{row.tertiary}</td>
                          <td>{row.totalLead}</td>
                          <td>{row.totalOpenLead}</td>
                          <td>{row.totalRejectLead}</td>
                          <td>{row.top}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>No data available</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

          </div>
        </>
      ) : (
        /* ── Empty state: sub-dashboard open but no user selected yet ── */
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '55vh', gap: '16px', color: '#94a3b8', userSelect: 'none'
        }}>
          <Search size={52} style={{ color: '#cbd5e1', strokeWidth: 1.5 }} />
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '18px', fontWeight: '600', color: '#64748b', margin: '0 0 8px 0' }}>
              Search for a {dashboardView === 'Admin' ? 'admin' : dashboardView === 'Manager' ? 'manager' : 'employee'} to view their dashboard
            </p>
            <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>
              Use the search bar on the right to find and select a user
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
