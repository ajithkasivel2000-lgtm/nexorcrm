import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Sparkles, MessageSquare, Home, Users, Target, FileText, BarChart2, Settings, Bell, Moon, Sun, User, Briefcase, LayoutGrid, LogOut, ChevronDown, ChevronRight, Filter, Maximize, IndianRupee, Building } from 'lucide-react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import AiAssistant from './ai/AiAssistant';
import AssistantWidget from './assistant/AssistantWidget';
import { SearchInput } from './ui';
import './Dashboard.css';
import { applyThemeColor } from './utils/pageMeta';
import NotificationMenu from './components/NotificationMenu';
import { subscribeDataChanged } from './utils/dataBus';
import SubscriptionBanner from './features/SubscriptionBanner';

const sidebarMenus = [
  {
    title: 'GENERAL', items: [
      { name: 'Dashboard', path: '/', icon: <Home size={18} />, pageId: 'dashboard' },
      { name: 'Leads', path: '/leads', icon: <Filter size={18} />, pageId: 'leads' },
      { name: 'Campaign Leads', path: '/campaign-leads', icon: <Filter size={18} />, pageId: 'leads' },
      { name: 'Import Leads', path: '/import-leads', icon: <FileText size={18} />, pageId: 'import-leads' },
      { name: 'Opportunity', path: '/opportunities', icon: <Target size={18} />, pageId: 'opportunities' },
      { name: 'Customer', path: '/customers', icon: <Users size={18} />, pageId: 'customers' },
      { name: 'Bookings & Payments', path: '/bookings', icon: <IndianRupee size={18} />, pageId: 'bookings' },
      { name: 'Report', path: '/report', icon: <BarChart2 size={18} />, pageId: 'report' },
      { name: 'Report Builder', path: '/report-builder', icon: <BarChart2 size={18} />, pageId: 'report', managersOnly: true },
      { name: 'Channel Partners', path: '/channel-partners', icon: <Users size={18} />, pageId: 'channel-partners' },
      { name: 'Team Chat', path: '/team-chat', icon: <MessageSquare size={18} />, pageId: 'team-chat' },
      { name: 'Assistant', path: '/assistant', icon: <Sparkles size={18} />, pageId: 'assistant' },
    ]
  },
  {
    title: 'OTHERS', items: [
      { name: 'RRQ', path: '/rrq', icon: <FileText size={18} />, pageId: 'rrq' },
      {
        // Goes straight to the list. Project Status and Project Type are
        // master tables that are set up once, so they no longer take up a
        // submenu — their pages are still there at /projects/status and
        // /projects/type.
        name: 'Projects',
        path: '/projects/list',
        icon: <Briefcase size={18} />,
        pageId: 'projects',
      },
      {
        name: 'Settings',
        icon: <Settings size={18} />,
        hasChevron: true,
        pageId: 'settings',
        /* Each entry carries its own pageId. Without them the whole menu was
           gated by the parent's 'settings' permission alone, which meant the
           user-admin and user-groups permissions had no effect here at all —
           they are rows in the matrix, and they live inside this menu.

           The nine configuration screens deliberately share one id: granting
           somebody Mail Settings but not Session Settings is a distinction
           nobody needs, and nine rows in the matrix for one job is worse than
           one row that says what it covers. */
        /* Ordered by what the row is about, not alphabetically: who can get in
           (people), then how leads are worked (assignment and reminders), then
           how the CRM talks to them (mail), then the account and safety rules,
           with the audit trail last. */
        subItems: [
          // People
          { name: 'User Admin', path: '/settings/user-admin', pageId: 'user-admin' },
          /* The page, its route and its permission all existed; only the link
             was missing, so the one way in was to type the URL. */
          { name: 'User Groups', path: '/settings/user-groups', pageId: 'user-groups' },

          // How work is distributed and chased
          { name: 'Lead Assignment', path: '/settings/lead-assignment', pageId: 'settings' },
          { name: 'Reminders', path: '/settings/reminders', pageId: 'settings' },

          // Outbound messaging
          { name: 'Mail Settings', path: '/settings/mail', pageId: 'settings' },
          { name: 'Email Templates', path: '/settings/email-templates', pageId: 'settings' },
          // WhatsApp, calling, ad lead sources, scheduled reports, company key.
          { name: 'Integrations', path: '/settings/integrations', pageId: 'settings' },
          { name: 'Billing & Plan', path: '/settings/billing', pageId: 'settings' },

          // Accounts and access rules
          { name: 'Registration', path: '/settings/registration', pageId: 'settings' },
          { name: 'Session', path: '/settings/session', pageId: 'settings' },
          { name: 'User', path: '/settings/user', pageId: 'settings' },
          { name: 'Security', path: '/settings/security', pageId: 'settings' },

          // The record of what happened
          { name: 'Logs', path: '/settings/logs', pageId: 'settings' }
        ]
      },
    ]
  }
];

export default function Dashboard({ onLogout, loggedInUser }) {
  const [isSidebarPinned, setIsSidebarPinned] = useState(true);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('isDarkMode') === 'true';
  });
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [expandedMenu, setExpandedMenu] = useState(null);
  const [userRole, setUserRole] = useState('Admin');
  const [profileImage, setProfileImage] = useState('');
  // null until loaded; usePagePermissions treats null as unrestricted.
  const [permissions, setPermissions] = useState(null);
  /* The company's branding (logo, accent colour) and subscription state.
     A lapsed subscription is also announced by any API call that returns 402. */
  const [brand, setBrand] = useState(null);
  const [inactiveReason, setInactiveReason] = useState('');
  useEffect(() => {
    fetch('/api/branding').then((r) => (r.ok ? r.json() : null)).then((b) => {
      if (!b) return;
      setBrand(b);
      if (b.brandColor) {
        document.documentElement.style.setProperty('--nx-accent', b.brandColor);
        document.documentElement.style.setProperty('--nx-accent-hover', b.brandColor);
      }
    }).catch(() => { });
    const onInactive = (e) => setInactiveReason(e.detail || 'Your subscription is not active.');
    window.addEventListener('nx:subscription-inactive', onInactive);
    return () => window.removeEventListener('nx:subscription-inactive', onInactive);
  }, []);

  // Platform administrators (PLATFORM_ADMINS on the server) also manage companies.
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  useEffect(() => {
    // Only administrators can be platform admins; nobody else needs to ask.
    if (!['Admin', 'superadmin'].includes(localStorage.getItem('userStatus'))) return;
    fetch('/api/company').then((r) => (r.ok ? r.json() : null)).then((c) => setIsPlatformAdmin(Boolean(c?.isPlatformAdmin))).catch(() => { });
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchRef = useRef(null);

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (!loggedInUser) return;
    try {
      const res = await fetch(`/api/notifications?username=${encodeURIComponent(loggedInUser)}`);
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.items || []);
      setUnreadCount(data.unread || 0);
    } catch {
      // The badge is not worth a console full of errors when the network is
      // down; the next poll will pick it up.
    }
  }, [loggedInUser]);

  /* Polled rather than pushed. A desktop notification already arrives the
     instant a lead is assigned; this only keeps the badge honest for someone
     sitting on the page, so a minute's delay costs nothing and a socket per
     signed-in user would. */
  useEffect(() => {
    fetchNotifications();
    const timer = setInterval(fetchNotifications, 60000);

    // Coming back to the tab is the moment the count is most likely stale.
    const onFocus = () => fetchNotifications();
    window.addEventListener('focus', onFocus);
    // Pushed the moment one is filed, over the live connection.
    const unsubscribe = subscribeDataChanged('notifications', fetchNotifications);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); unsubscribe(); };
  }, [fetchNotifications]);

  // Opening the bell should show what is there now, not what was there a
  // minute ago.
  useEffect(() => {
    if (showNotifications) fetchNotifications();
  }, [showNotifications, fetchNotifications]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Persist dark mode and apply to body for global components (like portals/modals)
  useEffect(() => {
    localStorage.setItem('isDarkMode', isDarkMode);
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    // The browser's own chrome — address bar, task switcher — is tinted by
    // theme-color, and the toggle changes the theme without a navigation, so
    // it has to be updated here rather than only on a route change.
    applyThemeColor();
  }, [isDarkMode]);


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

  /* Hoisted out of the mount effect so a later change can re-run it. The
     sidebar, the page guards and every screen reading the outlet context are
     all downstream of these two values, so leaving them at their mount-time
     answer meant a promotion or a permission edit did not reach the UI until
     someone reloaded the page. */
  const resolveRoleAndFetchPermissions = useCallback(async () => {
    let role = 'Admin';

    // 'admin' is always an Admin whatever the row says, but it is still a
    // real user record — so the lookup runs either way to pick up the
    // profile picture, and only the role is short-circuited.
    try {
      const res = await fetch(`/api/users/username/${loggedInUser}`);
      const data = await res.json();
      if (loggedInUser !== 'admin' && data && data.status) {
        role = data.status === 'Employee' ? 'User' : data.status;
      }
      if (data && data.profile_image) setProfileImage(data.profile_image);
    } catch (err) {
      console.error('Failed to fetch the signed-in user:', err);
    }

    setUserRole(role);

    /* The signed-in user's own permissions, fetched once and handed to every
       screen through the outlet. One request rather than one per page, and
       one answer so the sidebar and the buttons can never disagree.

       A failure leaves `permissions` null, which usePagePermissions reads as
       "allow" — a permission system that cannot load must not blank the app.*/
    try {
      const res = await fetch('/api/user-permissions/me');
      if (res.ok) setPermissions(await res.json());
    } catch (err) {
      console.error('Failed to fetch permissions:', err);
    }
  }, [loggedInUser]);

  useEffect(() => {
    if (!loggedInUser) return;
    resolveRoleAndFetchPermissions();
  }, [loggedInUser, resolveRoleAndFetchPermissions]);

  /* Promoting someone, editing their permissions, or activating an account all
     land here through the shared bus, which apiAuth publishes on every
     successful write. Re-resolving is one or two requests and only happens on
     an actual change, so it costs nothing while nothing is being edited. */
  useEffect(() => {
    if (!loggedInUser) return;
    return subscribeDataChanged(['users', 'user-permissions', 'user-groups'], () => {
      resolveRoleAndFetchPermissions();
    });
  }, [loggedInUser, resolveRoleAndFetchPermissions]);


  /**
   * Whether this person may see a page at all.
   *
   * A user with no permissions configured — or whose permissions have not
   * loaded yet — sees everything. That is the same default usePagePermissions
   * applies, so the menu and the buttons can never disagree about who someone
   * is, and a slow request never blinks the navigation away.
   */
  const canViewPage = useCallback((pageId) => {
    if (!pageId) return true;
    if (!permissions || permissions.superAdmin || !permissions.restricted) return true;
    const row = permissions.permissions?.find((p) => p.page === pageId);
    return Boolean(row?.view);
  }, [permissions]);

  const filteredSidebarMenus = useMemo(() => (isPlatformAdmin
    ? [...sidebarMenus, { title: 'PLATFORM', items: [{ name: 'Platform', path: '/platform/companies', icon: <Building size={18} /> }] }]
    : sidebarMenus)
    .map((section) => ({
      ...section,
      items: section.items
        /* Sub-items are filtered too. They were not, so a parent menu showed
           every child it had regardless of who was looking — the Settings
           menu handed out User Admin to anyone who could see Settings. */
        .map((item) => (item.subItems
          ? { ...item, subItems: item.subItems.filter((sub) => canViewPage(sub.pageId)) }
          : item))
        /* A parent with children is worth showing only while it still has
           one; a parent without children is judged on its own id. */
        .filter((item) => !item.managersOnly || ['Admin', 'superadmin', 'Manager'].includes(localStorage.getItem('userStatus')))
        .filter((item) => (item.subItems ? item.subItems.length > 0 : canViewPage(item.pageId))),
    }))
    .filter((section) => section.items.length > 0), [canViewPage, isPlatformAdmin]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    const results = [];
    filteredSidebarMenus.forEach(section => {
      section.items.forEach(item => {
        if (item.name.toLowerCase().includes(query)) {
          results.push({ ...item, section: section.title });
        }
        if (item.subItems) {
          item.subItems.forEach(sub => {
            if (sub.name.toLowerCase().includes(query)) {
              results.push({ ...sub, icon: item.icon, section: section.title });
            }
          });
        }
      });
    });
    return results;
  }, [searchQuery, filteredSidebarMenus]);

  /* Typing a URL must not get past the menu. Resolves the current path to a
     pageId the same way the sidebar does, then asks the same question. */
  const isPathAllowed = useMemo(() => {
    const current = location.pathname;
    let pageId = null;
    for (const section of sidebarMenus) {
      for (const item of section.items) {
        /* A sub-item's OWN id, not its parent's. Using the parent's meant
           /settings/user-admin was judged by the 'settings' permission, so
           anyone who could open Settings could type their way into User
           Admin — the exact hole the menu filtering above closes. */
        const sub = item.subItems?.find((s) => current === s.path
          || (s.path !== '/' && current.startsWith(s.path)));
        if (sub) { pageId = sub.pageId || item.pageId; break; }

        if (item.path && (current === item.path
          || (item.path !== '/' && current.startsWith(item.path)))) {
          pageId = item.pageId;
          break;
        }
      }
      if (pageId) break;
    }
    /* The dashboard is everyone's landing page, and a path that matches no
       menu entry is not ours to refuse — NotFound already handles those. */
    if (!pageId || pageId === 'dashboard') return true;
    return canViewPage(pageId);
  }, [location.pathname, canViewPage]);


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

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const isActivePath = useCallback((targetPath) => {
    if (!targetPath) return false;
    const current = location.pathname;

    // Exact match is always true
    if (current === targetPath) return true;

    // For Dashboard
    if (targetPath === '/') return current === '/';

    // For general routes, if current path starts with targetPath + '/' (e.g. /leads/123 -> /leads)
    if (current.startsWith(`${targetPath}/`)) return true;

    // Special case mapped subroutes (e.g. /projects/edit/:id -> /projects/list)
    if (targetPath === '/projects/list' && (current.startsWith('/projects/edit/') || current.startsWith('/projects/add/'))) return true;

    return false;
  }, [location.pathname]);

  // Helper to determine if an item or its subitems are active
  const isItemActive = useCallback((item) => {
    if (item.path && isActivePath(item.path)) return true;
    if (item.subItems) {
      return item.subItems.some(sub => isActivePath(sub.path));
    }
    return false;
  }, [isActivePath]);

  useEffect(() => {
    filteredSidebarMenus.forEach(section => {
      section.items.forEach(item => {
        if (isItemActive(item) && item.subItems) {
          setExpandedMenu(prev => prev === null ? item.name : prev);
        }
      });
    });
  }, [location.pathname, filteredSidebarMenus, isItemActive]);

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
              {brand?.logoUrl
                ? <img src={brand.logoUrl} alt={brand.name} style={{ height: '40px', maxWidth: '170px', objectFit: 'contain', background: '#fff', borderRadius: 6, padding: 2 }} />
                : <img src="/logo_light.png" alt="NexorCRM" style={{ height: '40px', objectFit: 'contain' }} />}
            </div>
          ) : (
            <div className="dashboard-logo-icon">
              <img src={brand?.logoUrl || '/favicon.png'} alt="" style={{ height: '28px', width: '28px', objectFit: 'contain' }} />
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
                              className={`sub-menu-item ${isActivePath(sub.path) ? 'is-active' : ''}`}
                              style={{ color: isActivePath(sub.path) ? 'orange' : '' }}
                              onClick={() => handleNavigate(sub.path)}
                            >
                              <span className="tree-dot" style={{ backgroundColor: isActivePath(sub.path) ? 'orange' : '' }}></span>
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

        {/* Pinned below the menu rather than inside it, so it stays put while
            a long menu scrolls. Hidden when the sidebar is collapsed — at 76px
            there is no room for it to say anything. */}
        <div className="sidebar-promo" aria-hidden="true">
          <span className="sidebar-promo__wave" />
          <img src="/logo_light.png" alt="" className="sidebar-promo__logo" />
          <p className="sidebar-promo__tagline">
            Smarter Leads
            <br />
            Stronger Business
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Header */}
        <header className="dashboard-header">
          <div className="header-left-group">
            <div className="search-bar-permanent" style={{ position: 'relative' }} ref={searchRef}>
              <SearchInput
                placeholder="Search modules..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchResults(true);
                }}
                onFocus={() => setShowSearchResults(true)}
              />

              {showSearchResults && searchQuery.trim() && (
                <div className="dropdown-menu" style={{ left: 0, right: 'auto', top: '100%', marginTop: '10px', width: '300px', maxHeight: '350px', overflowY: 'auto' }}>
                  <div className="dropdown-header">Search Results</div>
                  {searchResults.length > 0 ? (
                    searchResults.map((result, idx) => (
                      <button
                        key={idx}
                        className="dropdown-item"
                        style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                        onClick={() => {
                          if (result.path) {
                            handleNavigate(result.path);
                          } else {
                            toggleSubMenu(result.name);
                          }
                          setSearchQuery('');
                          setShowSearchResults(false);
                        }}
                      >
                        {result.icon && <span style={{ color: 'var(--text-muted)' }}>{result.icon}</span>}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1 }}>
                          <span style={{ fontSize: '14px', lineHeight: '1.2' }}>{result.name}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{result.section}</span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="dropdown-empty">No modules found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="header-actions">

            <div className="online-badge">
              <Users size={14} /> 1 online
            </div>

            <div style={{ position: 'relative' }}>
              <button
                className={`icon-btn ${showNotifications ? 'active' : ''}`}
                onClick={() => setShowNotifications(!showNotifications)}
                aria-label={unreadCount > 0
                  ? `Notifications, ${unreadCount} unread`
                  : 'Notifications'}
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="nx-notif-badge">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="dropdown-menu dropdown-menu--notifications">
                  <NotificationMenu
                    username={loggedInUser}
                    items={notifications}
                    onRefresh={fetchNotifications}
                    onClose={() => setShowNotifications(false)}
                  />
                </div>
              )}
            </div>

            <button
              className="icon-btn"
              onClick={() => setIsDarkMode(!isDarkMode)}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button className="icon-btn" onClick={toggleFullScreen} title="Toggle Fullscreen">
              <Maximize size={18} />
            </button>

            <div className="header-divider"></div>

            <div style={{ position: 'relative' }}>
              <div className="header-greeting-block" onClick={() => setShowUserMenu(!showUserMenu)} style={{ margin: 0 }}>
                <div className="greeting-avatar">
                  <div>
                    {profileImage
                      ? <img src={profileImage} alt="" className="greeting-avatar__img" />
                      : <User size={18} />}
                  </div>
                </div>
                <div className="greeting-text">
                  <div className="greeting-title" style={{ textAlign: 'left' }}>Hello, {loggedInUser === 'admin' ? 'Super' : (loggedInUser || 'Super')}</div>
                  <div className="greeting-role" style={{ textAlign: 'left' }}>{userRole === 'Admin' && loggedInUser === 'admin' ? 'Platform Admin' : userRole}</div>
                </div>
                <ChevronDown size={14} className="greeting-chevron" />
              </div>

              {showUserMenu && (
                <div className="dropdown-menu" style={{ right: 0 }}>
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
                    <Settings size={16} /> Settings
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
          <SubscriptionBanner subscription={brand?.subscription} inactiveReason={inactiveReason} onBilling={() => navigate('/settings/billing')} />
          {isPathAllowed ? (
            <Outlet context={{ userRole, permissions }} />
          ) : (
            <div className="access-denied-container" style={{ padding: '40px', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '8px', margin: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
              <h2 style={{ color: 'var(--nx-danger)', marginBottom: '10px' }}>Access Denied</h2>
              <p style={{ color: 'var(--nx-text-secondary)' }}>You do not have permission to access this page.</p>
            </div>
          )}
        </div>

        <footer className="dashboard-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* The signed-in company's name, and this year. */}
          <span>Copyright {new Date().getFullYear()} © {brand?.name || 'NexorCRM'}</span>
          <span style={{ marginRight: '70px' }}>powered by Infitoolz</span>
        </footer>
      </main>

      {/* Renders nothing unless the server has an ANTHROPIC_API_KEY. */}
      <AiAssistant />
      {/* Answers questions about the CRM itself, from the knowledge base on
          the server — so it works whether or not an AI key is configured. */}
      <AssistantWidget />
    </div>
  );
}
