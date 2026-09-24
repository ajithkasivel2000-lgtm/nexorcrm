import React, { useState, useEffect, useMemo, useRef } from 'react';
import { SearchInput } from './ui';
import { Users, ChevronDown, Search, X, ArrowLeft } from 'lucide-react';
import './Dashboard.css';
import DashboardInsights from './DashboardInsights';
import ProjectStatusBoard from './ProjectStatusBoard';
import { subscribeLeadCacheInvalidation } from './utils/invalidateLeadCache';
import useLiveRefresh from './utils/useLiveRefresh';

// ─── Role helpers ─────────────────────────────────────────────────────────────

/** Map a logged-in user's status to their home dashboard view. */
const getHomeView = (isSuperAdmin, status) => {
  if (isSuperAdmin) return 'Superadmin';
  if (status === 'Admin') return 'Admin';
  if (status === 'Manager') return 'Manager';
  return 'Employee';
};

/**
 * Sub-views the user can browse to from their home view.
 * The home view itself is NOT listed — it's always accessible via the Back button.
 */
const getDropdownOptions = (homeView) => {
  if (homeView === 'Superadmin') return ['Admin', 'Manager', 'Employee'];
  if (homeView === 'Admin') return ['Manager', 'Employee'];
  if (homeView === 'Manager') return ['Employee'];
  return []; // Employee / User — no sub-views
};/** Which user statuses the search should return for a given dashboard view. */
const getSearchStatus = (view) => {
  if (view === 'Admin')   return 'Manager';   // Admins search managers
  if (view === 'Manager') return 'Employee';  // Managers search employees
  return 'Employee';                          // Employees search employees (no one lower)
};

/** Search input placeholder text for a given dashboard view. */
const getSearchPlaceholder = (view) => {
  if (view === 'Admin') return 'Search admins by name or username...';
  if (view === 'Manager') return 'Search managers by name or username...';
  return 'Search employees by name or username...';
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardOverview() {
  const loggedInUser = localStorage.getItem('loggedInUser') || '';
  const isSuperAdmin = loggedInUser === 'admin';
  const userStatusFromStorage = localStorage.getItem('userStatus') || '';

  // ── Role / home view ─────────────────────────────────────────────────────
  const [homeView, setHomeView] = useState(getHomeView(isSuperAdmin, userStatusFromStorage));

  // ── Current dashboard view (starts at home) ───────────────────────────────
  const [dashboardView, setDashboardView] = useState(getHomeView(isSuperAdmin, userStatusFromStorage));

  // ── Project filter ────────────────────────────────────────────────────────
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('All Projects');

  // ── Dashboard data ────────────────────────────────────────────────────────
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Dashboard-view dropdown ───────────────────────────────────────────────
  const [isDashDropdownOpen, setIsDashDropdownOpen] = useState(false);
  const dashDropdownRef = useRef(null);

  // ── Specific user (from search) ───────────────────────────────────────────
  const [specificUser, setSpecificUser] = useState('');
  const [selectedUserInfo, setSelectedUserInfo] = useState(null);

  // ── Search ────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchRef = useRef(null);
  const debounceTimer = useRef(null);

  // ── Fetch true user role on mount ─────────────────────────────────────────
  useEffect(() => {
    if (loggedInUser && !isSuperAdmin) {
      fetch(`/api/users/username/${loggedInUser}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.status) {
            const status = data.status;
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
      if (dashDropdownRef.current && !dashDropdownRef.current.contains(e.target)) setIsDashDropdownOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSearchResults(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /* The stats below already refresh on any lead change (see the subscription
     further down); this is the project filter beside them, which was loaded
     once and so never showed a project added since the page opened. */
  useLiveRefresh(['projects'], () => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(data => setProjects(Array.isArray(data) ? data : []))
      .catch(err => console.error('Error refreshing projects:', err));
  });

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

  /* The window the Project Status tiles count over. Thirty days to start with,
     which is what they effectively showed before there was a picker. */
  const [range, setRange] = useState(() => ({
    from: new Date(Date.now() - 30 * 86400000),
    to: new Date(),
  }));

  /* Built once and used by both fetches below. Written out twice before, which
     is how the two could have drifted the moment anything new was added to it. */
  const dashboardUrl = useMemo(() => {
    const q = new URLSearchParams({
      username: loggedInUser || '',
      viewAsRole: dashboardView,
      from: new Date(range.from).toISOString(),
      to: new Date(range.to).toISOString(),
    });
    if (specificUser) q.set('specificUser', specificUser);
    if (selectedProject !== 'All Projects') q.set('project', selectedProject);
    return `/api/dashboard?${q.toString()}`;
  }, [loggedInUser, dashboardView, specificUser, selectedProject, range]);

  // ── Fetch dashboard stats ─────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    fetch(dashboardUrl)
      .then(res => res.json())
      .then(data => { setDashboardData(data); setLoading(false); })
      .catch(err => { console.error('Error fetching dashboard data:', err); setLoading(false); });
  }, [dashboardUrl]);

  // Keep dashboard stats in sync after any lead mutation anywhere in the CRM
  // (create, edit, delete, status change, assignment, follow-up, log, import).
  // The dashboard reads from /api/dashboard, which is derived from lead data,
  // so a lead change must re-fetch those stats without a browser refresh.
  useEffect(() => {
    const unsubscribe = subscribeLeadCacheInvalidation(() => {
      setLoading(true);
      fetch(dashboardUrl)
        .then(res => res.json())
        .then(data => { setDashboardData(data); setLoading(false); })
        .catch(err => { console.error('Error refreshing dashboard data after lead change:', err); setLoading(false); });
    });
    return unsubscribe;
  }, [dashboardUrl]);

  // ── Derived values ────────────────────────────────────────────────────────
  const dropdownOptions = getDropdownOptions(homeView);
  const isOnNonHomeView = dashboardView !== homeView;
  const roleNoun = dashboardView === 'Admin' ? 'admin'
    : dashboardView === 'Manager' ? 'manager' : 'employee';
  // Show search bar only when browsing a non-home sub-view
  const showSearchBar = isOnNonHomeView;

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
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status
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

  const selectProject = (name) => setSelectedProject(name);

  // ── Chart / stats data ────────────────────────────────────────────────────

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
                background: 'var(--nx-bg-sunken)', border: '1px solid var(--nx-border)', borderRadius: '8px',
                padding: '8px 14px', cursor: 'pointer', fontSize: '13px',
                color: 'var(--nx-text-secondary)', fontWeight: '500', whiteSpace: 'nowrap',
                transition: 'all 0.18s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--nx-bg-hover)'; e.currentTarget.style.color = 'var(--nx-text)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--nx-bg-sunken)'; e.currentTarget.style.color = 'var(--nx-text-secondary)'; }}
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
                margin: 0, fontSize: '24px', fontWeight: 'bold', color: 'var(--text-main)',
              }}
            >
              {dashboardTitle}
              {!isOnNonHomeView && dropdownOptions.length > 0 && <ChevronDown size={20} />}
            </h2>

            {isDashDropdownOpen && !isOnNonHomeView && dropdownOptions.length > 0 && (
              <ul
                style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: '8px',
                  background: 'var(--bg-card)', border: '1px solid var(--nx-border)', borderRadius: '8px',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.12)', zIndex: 100,
                  padding: '6px 0', margin: 0, listStyle: 'none', minWidth: '220px',
                }}
              >
                {dropdownOptions.map(view => (
                  <li
                    key={view}
                    onClick={() => handleViewSwitch(view)}
                    style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '14px', color: 'var(--nx-text)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--nx-bg-hover)'}
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
              <SearchInput
                placeholder={getSearchPlaceholder(dashboardView)}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onClear={clearSearch}
                onFocus={() => { if (searchResults.length > 0) setShowSearchResults(true); }}
              />
              {searchLoading && <span className="dashboard-user-search-spinner" />}
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
      {/* A role view shows that role's combined figures straight away; the
          search narrows to one person rather than being a prerequisite. */}
      {isOnNonHomeView && !specificUser && (
        <div className="dashboard-scope-note">
          <Users size={15} />
          <span>
            Showing every {roleNoun} together. Use the search to focus on one.
          </span>
        </div>
      )}

      {loading && !dashboardData ? (
        <div className="dashboard-scope-empty">
          <Search size={40} strokeWidth={1.5} />
          <p>Loading…</p>
        </div>
      ) : (
        <>
          {/* The whole-CRM picture. Everything below it is unchanged. */}
          <DashboardInsights overview={dashboardData?.overview} />

          {/* ── Project Status section ──────────────────────────────────────────── */}
          {/* Every figure, comparison and bar comes from /api/dashboard; the
              board decides how they read, not what they say. */}
          <ProjectStatusBoard
            tiles={dashboardData?.projectStatus || []}
            loading={loading}
            projects={projects}
            selectedProject={selectedProject}
            onProjectChange={selectProject}
            range={range}
            onRangeChange={setRange}
          />

        </>
      )}
    </div>
  );
}
