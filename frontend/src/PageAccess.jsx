import { useState, useEffect, useCallback } from 'react';
import { Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './PageAccessTab.css';

const CATEGORIES = [
  {
    name: 'DASHBOARD',
    pages: [
      { id: 'dashboard', label: 'Dashboard Overview', viewOnly: true },
    ]
  },
  {
    name: 'CRM & SALES',
    pages: [
      { id: 'leads', label: 'Leads', hasExport: true },
      { id: 'campaign-leads', label: 'Campaign Leads' },
      { id: 'import-leads', label: 'Import Leads' },
      { id: 'opportunities', label: 'Opportunities', hasExport: true },
      { id: 'customers', label: 'Customers', hasExport: true },
      { id: 'report', label: 'Report', hasExport: true },
    ]
  },
  {
    name: 'PROJECTS & SERVICES',
    pages: [
      { id: 'projects', label: 'Projects', hasExport: true },
      { id: 'channel-partners', label: 'Channel Partners', hasExport: true },
      { id: 'rrq', label: 'RRQ', hasExport: true },
    ]
  },
  {
    name: 'ADMINISTRATION',
    pages: [
      { id: 'user-admin', label: 'User Admin', hasExport: true },
      { id: 'user-groups', label: 'User Groups', hasExport: true },
      { id: 'settings', label: 'System Settings' },
      { id: 'master-lists', label: 'Master Lists' },
    ]
  }
];

const ROLES = ['Admin', 'Manager', 'User'];

// Helper: build empty permission map with all pages as false
const buildEmptyMap = () => {
  const map = {};
  CATEGORIES.forEach(cat => {
    cat.pages.forEach(p => {
      map[p.id] = { view: false, create: false, edit: false, delete: false, export: false };
    });
  });
  return map;
};

// Helper: convert array from server → map
const arrayToMap = (arr) => {
  const base = buildEmptyMap();
  if (Array.isArray(arr)) {
    arr.forEach(p => {
      base[p.page] = {
        view: !!p.view,
        create: !!p.create,
        edit: !!p.edit,
        delete: !!p.delete,
        export: !!p.export,
      };
    });
  }
  return base;
};

// Helper: convert map → array for server
const mapToArray = (map) =>
  Object.keys(map).map(page => ({
    page,
    view: !!map[page].view,
    create: !!map[page].create,
    edit: !!map[page].edit,
    delete: !!map[page].delete,
    export: !!map[page].export,
  }));

// Toast component
const Toast = ({ message, type, onClose }) => (
  <div className={`pa-toast pa-toast-${type}`}>
    <span>{message}</span>
    <button className="pa-toast-close" onClick={onClose}>×</button>
  </div>
);

const PageAccess = () => {
  const navigate = useNavigate();
  const [activeRole, setActiveRole] = useState('Admin');
  const [userRole, setUserRole] = useState('Admin');
  const [permissions, setPermissions] = useState(buildEmptyMap());
  const [savedPermissions, setSavedPermissions] = useState(buildEmptyMap());
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  const loggedInUser = localStorage.getItem('loggedInUser');
  const isSuperAdmin = loggedInUser === 'admin';

  useEffect(() => {
    if (loggedInUser && !isSuperAdmin) {
      fetch(`/api/users/username/${loggedInUser}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.status) {
            setUserRole(data.status);
            if (data.status === 'Admin') {
              setActiveRole('Manager');
            } else if (data.status === 'Manager') {
              setActiveRole('User');
            }
          }
        })
        .catch(err => console.error(err));
    }
  }, [loggedInUser, isSuperAdmin]);

  const visibleRoles = isSuperAdmin
    ? ROLES
    : userRole === 'Admin'
      ? ['Manager', 'User']
      : ['User'];

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchPermissions = useCallback(async (role) => {
    setIsFetching(true);
    try {
      const response = await fetch(`/api/page-access/${role}`);
      if (response.ok) {
        const data = await response.json();
        const map = arrayToMap(data.permissions);
        setPermissions(map);
        setSavedPermissions(JSON.parse(JSON.stringify(map)));
        setHasUnsaved(false);
      } else {
        const empty = buildEmptyMap();
        setPermissions(empty);
        setSavedPermissions(empty);
        setHasUnsaved(false);
      }
    } catch (err) {
      console.error('Error fetching permissions', err);
      showToast('Network error while loading permissions.', 'error');
    }
    setIsFetching(false);
  }, []);

  useEffect(() => {
    fetchPermissions(activeRole);
  }, [activeRole, fetchPermissions]);

  // Track unsaved changes
  useEffect(() => {
    const changed = JSON.stringify(permissions) !== JSON.stringify(savedPermissions);
    setHasUnsaved(changed);
  }, [permissions, savedPermissions]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const permArray = mapToArray(permissions);
      const response = await fetch(`/api/page-access/${activeRole}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: permArray })
      });

      if (response.ok) {
        setSavedPermissions(JSON.parse(JSON.stringify(permissions)));
        setHasUnsaved(false);
        showToast('Permissions saved successfully!', 'success');
        // Notify Dashboard to immediately re-fetch sidebar permissions
        window.dispatchEvent(new CustomEvent('pageAccessUpdated', { detail: { role: activeRole } }));
      } else {
        const errData = await response.json().catch(() => ({}));
        showToast(`Failed to save: ${errData.message || response.statusText}`, 'error');
      }
    } catch (err) {
      console.error('Error saving permissions', err);
      showToast('Network error while saving.', 'error');
    }
    setIsSaving(false);
  };

  const handleReset = () => {
    setPermissions(JSON.parse(JSON.stringify(savedPermissions)));
    setHasUnsaved(false);
    showToast('Reverted unsaved changes.', 'info');
  };

  const handleRoleChange = (role) => {
    if (hasUnsaved) {
      if (!window.confirm('You have unsaved changes. Discard them?')) {
        return;
      }
    }
    setActiveRole(role);
  };

  const toggleCheckbox = (pageId, field) => {
    setPermissions(prev => {
      const pagePerms = prev[pageId] || { view: false, create: false, edit: false, delete: false, export: false };
      return {
        ...prev,
        [pageId]: { ...pagePerms, [field]: !pagePerms[field] }
      };
    });
  };

  const enableRow = (pageId) => {
    // Find page config
    let pageConfig = null;
    for (const cat of CATEGORIES) {
      const found = cat.pages.find(p => p.id === pageId);
      if (found) {
        pageConfig = found;
        break;
      }
    }
    const supportsExport = pageConfig ? !!pageConfig.hasExport : false;
    const isViewOnly = pageConfig ? !!pageConfig.viewOnly : false;

    setPermissions(prev => ({
      ...prev,
      [pageId]: {
        view: true,
        create: !isViewOnly,
        edit: !isViewOnly,
        delete: !isViewOnly,
        export: supportsExport
      }
    }));
  };

  const clearRow = (pageId) => {
    setPermissions(prev => ({
      ...prev,
      [pageId]: { view: false, create: false, edit: false, delete: false, export: false }
    }));
  };

  const enableCategory = (category) => {
    setPermissions(prev => {
      const newPerms = { ...prev };
      category.pages.forEach(p => {
        newPerms[p.id] = {
          view: true,
          create: !p.viewOnly,
          edit: !p.viewOnly,
          delete: !p.viewOnly,
          export: !!p.hasExport
        };
      });
      return newPerms;
    });
  };

  const clearCategory = (category) => {
    setPermissions(prev => {
      const newPerms = { ...prev };
      category.pages.forEach(p => {
        newPerms[p.id] = { view: false, create: false, edit: false, delete: false, export: false };
      });
      return newPerms;
    });
  };

  const getEnabledCount = () => {
    return Object.values(permissions).filter(p => p.view || p.create || p.edit || p.delete || p.export).length;
  };

  const getTotalPages = () => CATEGORIES.reduce((sum, cat) => sum + cat.pages.length, 0);

  const handleExportCSV = () => { };
  const handleExportPDF = () => { };

  return (
    <div className="leads-page" style={{ padding: '24px 20px', backgroundColor: '#f1f5f9', minHeight: '100vh', boxSizing: 'border-box' }}>
      <div className="leads-header" style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', margin: '0 0 8px 0' }}>Page Access</h2>
        <div className="page-breadcrumb" style={{ fontSize: '14px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Home size={14} style={{ cursor: 'pointer' }} onClick={() => navigate('/')} />
          <span className="slash">/</span>
          <span className="current">Page Access</span>
        </div>
      </div>

      <div className="page-access-container leads-card" style={{ padding: '0', background: 'transparent', boxShadow: 'none' }}>
        {/* Toast */}
        {toast && (
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}

        {/* Header content below Breadcrumb */}
        <div className="page-access-header leads-card" style={{ padding: '24px' }}>
          <div className="header-titles">
            <h3>Unified Permission Matrix</h3>
            <p>Edit role and scope-specific page access from one screen.</p>
            {hasUnsaved && <span className="unsaved-badge">● Unsaved changes</span>}
          </div>
          <div className="header-actions-right">
            <button
              className="btn-reset"
              onClick={handleReset}
              disabled={isFetching || isSaving || !hasUnsaved}
              title="Revert to last saved state"
            >
              Reset
            </button>
            <button
              className="btn-save-perms"
              onClick={handleSave}
              disabled={isFetching || isSaving}
            >
              {isSaving ? (
                <><span className="spinner" /> Saving...</>
              ) : 'Save Permissions'}
            </button>
          </div>
        </div>

        {/* Role Tabs */}
        <div className="role-tabs">
          {visibleRoles.map(role => (
            <button
              key={role}
              className={`role-tab ${activeRole === role ? 'active' : ''}`}
              onClick={() => handleRoleChange(role)}
            >
              {role}
              {activeRole === role && hasUnsaved && <span className="tab-dot" />}
            </button>
          ))}
        </div>

        {/* Scope Banner */}
        <div className="scope-banner">
          <span>
            <strong>Current scope:</strong> {activeRole}
            {isFetching && <span className="loading-text"> — Loading...</span>}
          </span>
          <span className="enabled-count">
            {getEnabledCount()} / {getTotalPages()} pages enabled
          </span>
        </div>

        {/* Loading Overlay */}
        {isFetching ? (
          <div className="pa-loading-state">
            <div className="pa-spinner-large" />
            <p>Loading permissions for {activeRole}...</p>
          </div>
        ) : (
          CATEGORIES.map(cat => {
            const catPages = cat.pages;
            const isCrmCategory = cat.name === 'CRM & SALES';

            const allCatEnabled = catPages.every(p => {
              const perms = permissions[p.id] || {};
              const viewOk = perms.view;
              const createOk = p.viewOnly ? true : perms.create;
              const editOk = p.viewOnly ? true : perms.edit;
              const deleteOk = p.viewOnly ? true : perms.delete;
              const exportOk = p.hasExport ? perms.export : true;
              return viewOk && createOk && editOk && deleteOk && exportOk;
            });

            return (
              <div key={cat.name} className="category-section">
                <div className="category-header">
                  <h4>{cat.name}</h4>
                  <div className="category-actions">
                    <button
                      className="btn-enable-cat"
                      onClick={() => enableCategory(cat)}
                      disabled={allCatEnabled}
                    >
                      Enable All
                    </button>
                    <button
                      className="btn-clear-cat"
                      onClick={() => clearCategory(cat)}
                      disabled={!catPages.some(p => {
                        const perms = permissions[p.id] || {};
                        return perms.view || perms.create || perms.edit || perms.delete || perms.export;
                      })}
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <table className="permissions-table">
                  <thead>
                    <tr>
                      <th className="col-page">Page</th>
                      <th className="col-check">View</th>
                      <th className="col-check">Create</th>
                      <th className="col-check">Edit</th>
                      <th className="col-check">Delete</th>
                      {cat.name !== 'DASHBOARD' && <th className="col-check">Export</th>}
                      <th className="col-all">All</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catPages.map(page => {
                      const p = permissions[page.id] || { view: false, create: false, edit: false, delete: false, export: false };
                      const isViewOnly = !!page.viewOnly;
                      const isAllEnabled = isViewOnly
                        ? p.view
                        : (p.view && p.create && p.edit && p.delete && (page.hasExport ? p.export : true));
                      const isAnyEnabled = p.view || p.create || p.edit || p.delete || p.export;

                      return (
                        <tr key={page.id} className={isAnyEnabled ? 'row-active' : ''}>
                          <td className="col-page">
                            <div className="page-name">{page.label}</div>
                            <div className="page-slug">{page.id}</div>
                          </td>
                          {/* View — always shown */}
                          <td className="col-check">
                            <label className="checkbox-wrapper">
                              <input
                                type="checkbox"
                                checked={p.view}
                                onChange={() => toggleCheckbox(page.id, 'view')}
                              />
                              <span className="custom-checkbox" />
                            </label>
                          </td>
                          {/* Create — hidden for view-only pages */}
                          <td className="col-check">
                            {isViewOnly ? (
                              <span style={{ color: '#cbd5e1', fontSize: '12px' }}>—</span>
                            ) : (
                              <label className="checkbox-wrapper">
                                <input
                                  type="checkbox"
                                  checked={p.create}
                                  onChange={() => toggleCheckbox(page.id, 'create')}
                                />
                                <span className="custom-checkbox" />
                              </label>
                            )}
                          </td>
                          {/* Edit — hidden for view-only pages */}
                          <td className="col-check">
                            {isViewOnly ? (
                              <span style={{ color: '#cbd5e1', fontSize: '12px' }}>—</span>
                            ) : (
                              <label className="checkbox-wrapper">
                                <input
                                  type="checkbox"
                                  checked={p.edit}
                                  onChange={() => toggleCheckbox(page.id, 'edit')}
                                />
                                <span className="custom-checkbox" />
                              </label>
                            )}
                          </td>
                          {/* Delete — hidden for view-only pages */}
                          <td className="col-check">
                            {isViewOnly ? (
                              <span style={{ color: '#cbd5e1', fontSize: '12px' }}>—</span>
                            ) : (
                              <label className="checkbox-wrapper">
                                <input
                                  type="checkbox"
                                  checked={p.delete}
                                  onChange={() => toggleCheckbox(page.id, 'delete')}
                                />
                                <span className="custom-checkbox" />
                              </label>
                            )}
                          </td>
                          {cat.name !== 'DASHBOARD' && (
                            <td className="col-check">
                              {page.hasExport ? (
                                <label className="checkbox-wrapper">
                                  <input
                                    type="checkbox"
                                    checked={p.export}
                                    onChange={() => toggleCheckbox(page.id, 'export')}
                                  />
                                  <span className="custom-checkbox" />
                                </label>
                              ) : (
                                <span style={{ color: '#cbd5e1', fontSize: '12px' }}>—</span>
                              )}
                            </td>
                          )}
                          <td className="col-all">
                            {isAllEnabled ? (
                              <button className="btn-row-clear" onClick={() => clearRow(page.id)}>
                                Clear
                              </button>
                            ) : (
                              <button className="btn-row-enable" onClick={() => enableRow(page.id)}>
                                Enable
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default PageAccess;
