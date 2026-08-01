import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Home,
  Users,
  Target,
  FileText,
  BarChart2,
  Settings,
  Search,
  Bell,
  Moon,
  Sun,
  User,
  Briefcase,
  LayoutGrid,
  LogOut,
  Settings as SettingsIcon,
  X,
  ChevronDown,
  ChevronRight,
  Filter
} from 'lucide-react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import './Dashboard.css';

const sidebarMenus = [
  {
    title: 'GENERAL', items: [
      { name: 'Dashboard', path: '/', icon: <Home size={18} />, pageId: 'dashboard' },
      {
        name: 'Sales Department',
        icon: <Filter size={18} />,
        pageId: 'leads',
        subItems: [
          { name: 'Leads', path: '/leads' },
          { name: 'Campaign Leads', path: '/campaign-leads' }
        ]
      },
      { name: 'Import Leads', path: '/import-leads', icon: <FileText size={18} />, pageId: 'import-leads' },
      { name: 'Opportunity', path: '/opportunities', icon: <Target size={18} />, pageId: 'opportunities' },
      { name: 'Customer', path: '/customers', icon: <Users size={18} />, pageId: 'customers' },
      { name: 'Report', path: '/report', icon: <BarChart2 size={18} />, pageId: 'report' },
      { name: 'Channel Partners', path: '/channel-partners', icon: <Users size={18} />, pageId: 'channel-partners' },
    ]
  },
  {
    title: 'OTHERS', items: [
      { name: 'RRQ', path: '/rrq', icon: <FileText size={18} />, pageId: 'rrq' },
      {
        name: 'Projects',
        icon: <Briefcase size={18} />,
        hasChevron: true,
        pageId: 'projects',
        subItems: [
          { name: 'Project List', path: '/projects/list' },
          { name: 'Project Status', path: '/projects/status' },
          { name: 'Project Type', path: '/projects/type' }
        ]
      },
      {
        name: 'Lead Source',
        icon: <Target size={18} />,
        hasChevron: true,
        pageId: 'master-lists',
        subItems: [
          { name: 'Primary Source', path: '/lead-source/primary' },
          { name: 'Secondary Source', path: '/lead-source/secondary' },
          { name: 'Tertiary Source', path: '/lead-source/tertiary' },
          { name: 'Lead Status', path: '/lead-source/status' },
          { name: 'Lead Type', path: '/lead-source/type' }
        ]
      },
      {
        name: 'Settings',
        icon: <Settings size={18} />,
        hasChevron: true,
        pageId: 'settings',
        subItems: [
          { name: 'User Admin', path: '/settings/user-admin' },
          { name: 'User Groups', path: '/settings/user-groups' },
          { name: 'Page Access', path: '/settings/page-access' },
          { name: 'Registration', path: '/settings/registration' },
          { name: 'Session', path: '/settings/session' },
          { name: 'User', path: '/settings/user' },
          { name: 'Security', path: '/settings/security' },
          { name: 'Logs', path: '/settings/logs' },
          { name: 'Mail Settings', path: '/settings/mail' },
          { name: 'Email Templates', path: '/settings/email-templates' }
        ]
      },
    ]
  }
];

export default function Dashboard({ onLogout, loggedInUser }) {
  const [isSidebarPinned, setIsSidebarPinned] = useState(true);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [expandedMenu, setExpandedMenu] = useState(null);
  const [userRole, setUserRole] = useState('Admin');
  const [pagePermissions, setPagePermissions] = useState(null); // null = not loaded yet
  const [permissionsList, setPermissionsList] = useState([]);

  const navigate = useNavigate();
  const location = useLocation();

  const mainWrapperRef = useRef(null);
  const sidebarRef = useRef(null);

  // Auto-scroll main content to top on navigation
  useEffect(() => {
    if (mainWrapperRef.current) {
      mainWrapperRef.current.scrollTo(0, 0);
    }
  }, [location.pathname]);

  // Auto-scroll sidebar when a menu expands or page changes so the active item is in view
  useEffect(() => {
    if (sidebarRef.current) {
      setTimeout(() => {
        const activeItem = sidebarRef.current.querySelector('.sidebar-item-container.active, .sidebar-item.expanded');
        if (activeItem) {
          activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300); // Wait for potential menu expansion or permission loading
    }
  }, [expandedMenu, location.pathname]);

  useEffect(() => {
    if (!loggedInUser) return;

    const resolveRoleAndFetchPermissions = async () => {
      let role = 'Admin';

      if (loggedInUser !== 'admin') {
        try {
          const res = await fetch(`/api/users/username/${loggedInUser}`);
          const data = await res.json();
          if (data && data.status) {
            role = data.status === 'Employee' ? 'User' : data.status;
          }
        } catch (err) {
          console.error('Failed to fetch user role:', err);
        }
      }

      setUserRole(role);
      fetchPagePermissions(role);
    };

    resolveRoleAndFetchPermissions();
  }, [loggedInUser]);

  const fetchPagePermissions = async (role) => {
    try {
      const res = await fetch(`/api/page-access/${role}`);
      if (!res.ok) {
        setPagePermissions(null); // API error → show all
        setPermissionsList([]);
        return;
      }
      const data = await res.json();
      setPermissionsList(data.permissions || []);

      // If no permissions record saved yet for this role → show all (safe default)
      if (!Array.isArray(data.permissions) || data.permissions.length === 0) {
        setPagePermissions(null);
        return;
      }

      // Build the set of enabled pageIds
      const enabledPages = new Set();
      data.permissions.forEach(p => {
        if (p.view || p.create || p.edit || p.delete || p.export) {
          enabledPages.add(p.page);
        }
      });

      // Use the set (even if empty — means all disabled)
      setPagePermissions(enabledPages);
    } catch (err) {
      console.error('Failed to fetch page permissions:', err);
      setPagePermissions(null); // Network error → show all
    }
  };

  const filteredSidebarMenus = useMemo(() => {
    // Superadmin bypasses permission checks
    if (loggedInUser === 'admin') return sidebarMenus;

    // null = not loaded yet OR no record in DB → show everything
    if (pagePermissions === null) return sidebarMenus;

    // Filter: only show items whose pageId is in the enabled set
    return sidebarMenus
      .map(section => ({
        ...section,
        items: section.items.filter(item =>
          !item.pageId || pagePermissions.has(item.pageId)
        )
      }))
      .filter(section => section.items.length > 0);
  }, [userRole, pagePermissions, loggedInUser]);

  const isPathAllowed = useMemo(() => {
    if (loggedInUser === 'admin') return true;
    if (pagePermissions === null) return true;

    const currentPath = location.pathname;

    let currentPageId = null;
    for (const section of sidebarMenus) {
      for (const item of section.items) {
        if (item.path && (currentPath === item.path || (item.path !== '/' && currentPath.startsWith(item.path)))) {
          currentPageId = item.pageId;
          break;
        }
        if (item.subItems) {
          const subMatch = item.subItems.some(sub => currentPath === sub.path || (sub.path !== '/' && currentPath.startsWith(sub.path)));
          if (subMatch) {
            currentPageId = item.pageId;
            break;
          }
        }
      }
      if (currentPageId) break;
    }

    if (!currentPageId || currentPageId === 'dashboard') return true;

    return pagePermissions.has(currentPageId);
  }, [pagePermissions, loggedInUser, location.pathname]);

  // Listen for page access saves from PageAccessTab and immediately update the sidebar
  useEffect(() => {
    const handlePageAccessUpdated = (e) => {
      const updatedRole = e.detail?.role;
      // Re-fetch when the saved role matches the current user's role
      if (updatedRole && updatedRole === userRole) {
        fetchPagePermissions(userRole);
      }
    };
    window.addEventListener('pageAccessUpdated', handlePageAccessUpdated);
    return () => window.removeEventListener('pageAccessUpdated', handlePageAccessUpdated);
  }, [userRole]);

  const isSidebarOpen = isSidebarPinned || isSidebarHovered;

  const toggleSubMenu = (menuName) => {
    if (expandedMenu === menuName) {
      setExpandedMenu(null);
    } else {
      setExpandedMenu(menuName);
    }
  };

  const handleNavigate = (path) => {
    if (path) {
      navigate(path);
    }
  };

  // Helper to determine if an item or its subitems are active
  const isItemActive = (item) => {
    if (item.path && location.pathname === item.path) return true;
    if (item.subItems) {
      return item.subItems.some(sub => sub.path && location.pathname === sub.path);
    }
    return false;
  };

  useEffect(() => {
    filteredSidebarMenus.forEach(section => {
      section.items.forEach(item => {
        if (isItemActive(item) && item.subItems) {
          setExpandedMenu(prev => prev === null ? item.name : prev);
        }
      });
    });
  }, [location.pathname, filteredSidebarMenus]);

  return (
    <div className={`dashboard-layout ${isSidebarOpen ? '' : 'sidebar-collapsed'} ${isDarkMode ? 'dark-mode' : ''}`}>
      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className="sidebar"
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
      >
        <div className="sidebar-logo">
          {isSidebarOpen ? (
            <div className="dashboard-logo-full">
              <img src="/logo_light.png" alt="NexorCRM" style={{ height: '40px', objectFit: 'contain' }} />
            </div>
          ) : (
            <div className="dashboard-logo-icon">
              <img src="/favicon.png" alt="NexorCRM Icon" style={{ height: '28px', width: '28px', objectFit: 'contain' }} />
            </div>
          )}
          <button
            className={`sidebar-toggle ${isSidebarPinned ? 'active' : ''}`}
            onClick={() => setIsSidebarPinned(!isSidebarPinned)}
          >
            <LayoutGrid size={18} />
          </button>
        </div>

        <div className="sidebar-content">
          {filteredSidebarMenus.map((section, idx) => (
            <div key={idx} className="sidebar-section">
              <div className="section-title">{section.title}</div>
              <ul>
                {section.items.map((item, i) => {
                  const isActive = isItemActive(item);
                  const isExpanded = expandedMenu === item.name;
                  const hasSub = item.subItems && item.subItems.length > 0;

                  return (
                    <li key={i} className={`sidebar-item-container ${isActive ? 'active' : ''}`}>
                      <div
                        className={`sidebar-item ${isExpanded ? 'expanded' : ''}`}
                        onClick={() => {
                          if (hasSub) {
                            toggleSubMenu(item.name);
                          } else {
                            setExpandedMenu(null);
                            handleNavigate(item.path);
                          }
                        }}
                      >
                        <span className="icon">{item.icon}</span>
                        <span className="text">{item.name}</span>
                        {(hasSub || item.hasChevron) && (
                          <span className="chevron">
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                        )}
                      </div>
                      {hasSub && isExpanded && (
                        <ul className="sub-menu">
                          {item.subItems.map((sub, j) => (
                            <li
                              key={j}
                              className="sub-menu-item"
                              style={{ color: location.pathname === sub.path ? 'orange' : '' }}
                              onClick={() => handleNavigate(sub.path)}
                            >
                              <span className="tree-dot" style={{ backgroundColor: location.pathname === sub.path ? 'orange' : '' }}></span>
                              {sub.name}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Header */}
        <header className="dashboard-header" style={{ justifyContent: 'flex-end' }}>
          <div className="header-actions">
            {showSearch ? (
              <div className="search-bar-container">
                <input type="text" placeholder="Search..." autoFocus />
                <button onClick={() => setShowSearch(false)}><X size={16} /></button>
              </div>
            ) : (
              <button className="icon-btn" onClick={() => setShowSearch(true)}>
                <Search size={18} />
              </button>
            )}

            <div style={{ position: 'relative' }}>
              <button
                className={`icon-btn ${showNotifications ? 'active' : ''}`}
                onClick={() => setShowNotifications(!showNotifications)}
              >
                <Bell size={18} />
              </button>
              {showNotifications && (
                <div className="dropdown-menu">
                  <div className="dropdown-header">Notifications</div>
                  <div className="dropdown-empty">No new notifications</div>
                </div>
              )}
            </div>

            <button
              className="icon-btn"
              onClick={() => setIsDarkMode(!isDarkMode)}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <div style={{ position: 'relative' }}>
              <div
                className="user-profile"
                onClick={() => setShowUserMenu(!showUserMenu)}
              >
                <div className="avatar"><User size={16} /></div>
                <span>{loggedInUser || 'admin'}</span>
              </div>

              {showUserMenu && (
                <div className="dropdown-menu">
                  <div className="dropdown-header">{loggedInUser || 'admin'}</div>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      handleNavigate('/my-profile');
                      setShowUserMenu(false);
                    }}
                  >
                    <User size={16} /> My Profile
                  </button>
                  <button className="dropdown-item">
                    <SettingsIcon size={16} /> Settings
                  </button>
                  <button
                    className="dropdown-item text-danger"
                    onClick={onLogout}
                  >
                    <LogOut size={16} /> Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="dashboard-page-wrapper" ref={mainWrapperRef}>
          {isPathAllowed ? (
            <Outlet context={{ userRole, permissionsList }} />
          ) : (
            <div className="access-denied-container" style={{ padding: '40px', textAlign: 'center', background: '#fff', borderRadius: '8px', margin: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
              <h2 style={{ color: '#ef4444', marginBottom: '10px' }}>Access Denied</h2>
              <p style={{ color: '#4b5563' }}>You do not have permission to access this page.</p>
            </div>
          )}
        </div>

        <footer className="dashboard-footer">
          Copyright 2026 © NexorCRM
        </footer>
      </main>
    </div>
  );
}
