import { useState, useEffect } from 'react';
import { Trash2, Folder, Lock, User, List, Users, Plus } from 'lucide-react';
import './RRQ.css';
import { Button, DataTable, Input, Page, Pill, RowActions, Select } from './ui';
import usePagePermissions from './hooks/usePagePermissions';
import { withoutSuperAdmin } from './utils/superAdmin';
import useLiveRefresh from './utils/useLiveRefresh';
import invalidateLeadCache from './utils/invalidateLeadCache';
import { isReservedRrqType } from './utils/rrqTypes';
import { isSuperAdmin } from './utils/currentUser';





const formatRrqDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
};

export default function RRQ() {
  // Gated by this user's own permissions. See usePagePermissions.
  const { canCreate, canEdit, canDelete, canExport } = usePagePermissions('rrq');

  const [rrqs, setRrqs] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);

  /* assignedUsers holds user ids; show usernames instead. Falls back to the
     raw id when a user has since been deleted. */
  const resolveAssignedUsers = (rrq) =>
    (rrq.assignedUsers || [])
      .map((uid) => {
        const user = availableUsers.find((u) => u.id === uid);
        return user ? (user.username || user.firstName || uid) : uid;
      })
      .join(', ');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    projectName: '',
    rrqName: '',
    rrqType: ''
  });

  const [projectsList, setProjectsList] = useState([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editError, setEditError] = useState('');
  const [editFormData, setEditFormData] = useState(null);

  // Dynamic RRQ Types
  const [rrqTypes, setRrqTypes] = useState([]);
  const [newTypeName, setNewTypeName] = useState('');
  const [typeError, setTypeError] = useState('');
  const [showManageTypes, setShowManageTypes] = useState(false);

  // Dynamic Projects
  const [showManageProjects, setShowManageProjects] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectError, setProjectError] = useState('');

  useEffect(() => {
    fetchRRQs();
    fetchUsers();
    fetchProjects();
    fetchRRQTypes();
  }, []);

  /* Projects especially: a queue's project is a plain string match, so a
     project renamed on another screen is exactly what leaves a queue orphaned
     and silently assigning nobody. Refetching here means the warning appears
     without anyone reloading. */
  useLiveRefresh(['rrq', 'rrq-types', 'projects', 'users'], () => {
    fetchRRQs(); fetchUsers(); fetchProjects(); fetchRRQTypes();
  });

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      if (response.ok) {
        const data = await response.json();
        setProjectsList(data);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        // Store full user objects so we can send UUIDs to the backend
        setAvailableUsers(data);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchRRQs = async () => {
    try {
      const response = await fetch('/api/rrq');
      if (response.ok) {
        const data = await response.json();
        setRrqs(data);
      }
    } catch (error) {
      console.error('Failed to fetch RRQs:', error);
    }
  };

  const fetchRRQTypes = async () => {
    try {
      const response = await fetch('/api/rrq-types');
      if (response.ok) {
        const data = await response.json();
        setRrqTypes(data);
      }
    } catch (error) {
      console.error('Failed to fetch RRQ types:', error);
    }
  };

  const handleAddType = async () => {
    const trimmed = newTypeName.trim();
    if (!trimmed) return setTypeError('Type name cannot be empty.');
    try {
      const res = await fetch('/api/rrq-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typeName: trimmed }),
      });
      if (res.ok) {
        setNewTypeName('');
        setTypeError('');
        fetchRRQTypes();
      } else {
        const err = await res.json();
        setTypeError(err.message || 'Failed to add type.');
      }
    } catch {
      setTypeError('Failed to add type.');
    }
  };

  const handleDeleteType = async (id, typeName) => {
    if (!await window.appConfirm(`Delete the RRQ type "${typeName}"?`)) return;
    try {
      const res = await fetch(`/api/rrq-types/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchRRQTypes();
        return;
      }
      // A refusal used to look exactly like a success: nothing happened and
      // the row was simply still there.
      const err = await res.json().catch(() => ({}));
      setTypeError(err.message || 'Failed to delete type.');
    } catch (error) {
      console.error('Failed to delete RRQ type:', error);
      setTypeError('Could not reach the server.');
    }
  };

  const handleAddProject = async () => {
    const trimmed = newProjectName.trim();
    if (!trimmed) return setProjectError('Project name cannot be empty.');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: trimmed }),
      });
      if (res.ok) {
        setNewProjectName('');
        setProjectError('');
        fetchProjects();
        invalidateLeadCache();
      } else {
        const err = await res.json();
        setProjectError(err.message || 'Failed to add project.');
      }
    } catch {
      setProjectError('Failed to add project.');
    }
  };

  const handleDeleteProject = async (id, projectName) => {
    if (!await window.appConfirm(`Delete project "${projectName}"?`)) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchProjects();
        invalidateLeadCache();
      } else {
        const err = await res.json();
        window.appAlert(err.message || 'Failed to delete project.');
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };


  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/rrq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (response.ok) {
        setIsModalOpen(false);
        setFormData({ projectName: '', rrqName: '', rrqType: '' });
        fetchRRQs();
        // RRQ drives round-robin lead assignment; a change can affect which
        // user owns a lead, so refresh every lead view without a reload.
        invalidateLeadCache();
      }
    } catch (error) {
      console.error('Failed to create RRQ:', error);
    }
  };



  const handleOpenEdit = (rrq) => {
    setEditFormData({ ...rrq });
    setEditError('');
    setIsEditModalOpen(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setEditError('');
    try {
      /* Only the columns the form owns. handleOpenEdit spreads the whole row
         to seed the form, and that row carries getRRQs' computed
         projectMissing flag plus id/createdAt — none of which are columns
         Prisma will accept in an update, so sending the object back whole
         failed validation before it ever reached the database. */
      const response = await fetch(`/api/rrq/${editFormData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: editFormData.projectName,
          rrqName: editFormData.rrqName,
          rrqType: editFormData.rrqType,
          assignedUsers: editFormData.assignedUsers,
        })
      });
      if (response.ok) {
        setIsEditModalOpen(false);
        setEditFormData(null);
        setEditError('');
        fetchRRQs();
        invalidateLeadCache();
      } else {
        /* The server explains itself — an orphaned project name comes back
           with the list of names that do exist. Swallowing that left the
           modal open and unchanged, which reads as a dead Save button. */
        const err = await response.json().catch(() => ({}));
        setEditError(err.projects?.length
          ? `${err.message} Pick one of: ${err.projects.join(', ')}.`
          : (err.message || `Could not save (${response.status}).`));
      }
    } catch (error) {
      console.error('Failed to update RRQ:', error);
      setEditError('Could not reach the server. Please try again.');
    }
  };

  const handleAddUser = (e) => {
    const userId = e.target.value;
    if (userId && !editFormData.assignedUsers.includes(userId)) {
      setEditFormData({
        ...editFormData,
        assignedUsers: [...editFormData.assignedUsers, userId]
      });
    }
    // reset select to default
    e.target.value = "";
  };

  const handleRemoveUser = (userToRemove) => {
    setEditFormData({
      ...editFormData,
      assignedUsers: editFormData.assignedUsers.filter(u => u !== userToRemove)
    });
  };

  const handleDeleteSelected = async (ids, clearSelection) => {
    if (!await window.appConfirm(`Delete ${ids.length} selected RRQ(s)?`)) return;
    try {
      const responses = await Promise.all(
        ids.map(id => fetch(`/api/rrq/${id}`, { method: 'DELETE' }))
      );
      clearSelection();
      fetchRRQs();
      invalidateLeadCache();
      const failed = responses.filter(r => !r.ok).length;
      if (failed > 0) {
        window.appAlert(`${failed} of ${ids.length} RRQ(s) could not be deleted.`);
      }
    } catch (err) {
      console.error('Failed to delete selected RRQs:', err);
      window.appAlert('Could not reach the server.');
    }
  };

  const rrqColumns = [
    {
      key: 'rrqId',
      label: 'RRQ Id',
      width: '150px',
      render: r => <span className="nx-page__id">{r.rrqId || '—'}</span>,
    },
    {
      key: 'rrqName',
      label: 'RRQ Name',
      render: r => <span className="nx-page__strong">{r.rrqName || '—'}</span>,
    },
    {
      key: 'rrqType',
      label: 'RRQ Type',
      width: '160px',
      render: r => (r.rrqType ? <Pill tone="accent">{r.rrqType}</Pill> : '—'),
    },
    { key: 'projectName', label: 'Project Name', width: '190px' },
    {
      key: 'assignedUsers',
      label: 'Assigned Users',
      sortable: false,
      // Stored as user ids; resolve to usernames for display and export.
      render: r => resolveAssignedUsers(r) || '—',
      exportValue: r => resolveAssignedUsers(r),
    },
    {
      key: 'createdAt',
      label: 'Created Date',
      width: '190px',
      render: r => formatRrqDate(r.createdAt),
      exportValue: r => formatRrqDate(r.createdAt),
    },
  ];

  return (
    <div className="rrq-page">
      <Page
        title="RRQ"
        subtitle="Create, view and edit RRQ. Assign users to RRQ."
        actions={canCreate ? (
          <Button variant="primary" icon={Plus} onClick={() => setIsModalOpen(true)}>
            Create RRQ
          </Button>
        ) : null}
      >
        <DataTable
          columns={rrqColumns}
          rows={rrqs}
          exportName={canExport ? 'rrq' : undefined}
          filters={['rrqType', 'projectName']}
          tabsFrom="rrqType"
          onDeleteSelected={canDelete ? handleDeleteSelected : undefined}
          searchPlaceholder="Search RRQ name, type or project..."
          emptyMessage="No RRQs yet"
          emptyHint="Create your first RRQ to start routing leads."
          actions={rrq => (
            <RowActions
              label={rrq.rrqName || 'RRQ'}
              onEdit={canEdit ? () => handleOpenEdit(rrq) : undefined}
            />
          )}
        />
      </Page>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Add RRQ</h3>
              <button
                className="btn-close"
                onClick={() => {
                  setIsModalOpen(false);
                  setShowManageTypes(false);
                  setNewTypeName('');
                  setTypeError('');
                  setShowManageProjects(false);
                  setNewProjectName('');
                  setProjectError('');
                }}
              >&times;</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Project Interested</span>
                    <button
                      type="button"
                      onClick={() => setShowManageProjects(prev => !prev)}
                      style={{ fontSize: '12px', color: 'var(--nx-accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                    >
                      {showManageProjects ? '✕ Close' : '⚙ Manage Projects'}
                    </button>
                  </label>
                  <Select
                    icon={Folder}
                    value={formData.projectName}
                    onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                    required
                  >
                    <option value="">Select Project</option>
                    {projectsList.map(p => <option key={p.id} value={p.projectName}>{p.projectName}</option>)}
                  </Select>

                  {showManageProjects && (
                    <div style={{ marginTop: '10px', border: '1px solid var(--nx-border)', borderRadius: '8px', padding: '12px', background: 'var(--nx-bg-sunken)' }}>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <input
                          type="text"
                          value={newProjectName}
                          onChange={e => { setNewProjectName(e.target.value); setProjectError(''); }}
                          placeholder="New project name"
                          style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--nx-border)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddProject())}
                        />
                        <button
                          type="button"
                          onClick={handleAddProject}
                          style={{ padding: '6px 14px', background: 'var(--nx-accent)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                        >
                          + Add
                        </button>
                      </div>
                      {projectError && <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--nx-danger)' }}>{projectError}</p>}
                      <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {projectsList.length === 0 && <p style={{ margin: 0, fontSize: '13px', color: 'var(--nx-text-muted)' }}>No projects yet. Add one above.</p>}
                        {projectsList.map(p => (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: 'var(--bg-card)', border: '1px solid var(--nx-border)', borderRadius: '6px' }}>
                            <span style={{ fontSize: '13px', color: 'var(--nx-text)' }}>{p.projectName}</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteProject(p.id, p.projectName)}
                              style={{ background: 'none', border: 'none', color: 'var(--nx-danger)', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}
                              title="Delete"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">RRQ Name</label>
                  <Input
                    type="text"
                    prefix={User}
                    placeholder="Enter RRQ Name"
                    value={formData.rrqName}
                    onChange={(e) => setFormData({ ...formData, rrqName: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>RRQ Type</span>
                    <button
                      type="button"
                      onClick={() => setShowManageTypes(prev => !prev)}
                      style={{ fontSize: '12px', color: 'var(--nx-accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                    >
                      {showManageTypes ? '✕ Close' : '⚙ Manage Types'}
                    </button>
                  </label>
                  <Select
                    icon={List}
                    value={formData.rrqType}
                    onChange={(e) => setFormData({ ...formData, rrqType: e.target.value })}
                    required
                  >
                    <option value="">Select RRQ Type</option>
                    {rrqTypes.map(t => <option key={t.id} value={t.typeName}>{t.typeName}</option>)}
                  </Select>

                  {showManageTypes && (
                    <div style={{ marginTop: '10px', border: '1px solid var(--nx-border)', borderRadius: '8px', padding: '12px', background: 'var(--nx-bg-sunken)' }}>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <input
                          type="text"
                          value={newTypeName}
                          onChange={e => { setNewTypeName(e.target.value); setTypeError(''); }}
                          placeholder="New type name"
                          style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--nx-border)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddType())}
                        />
                        <button
                          type="button"
                          onClick={handleAddType}
                          style={{ padding: '6px 14px', background: 'var(--nx-accent)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                        >
                          + Add
                        </button>
                      </div>
                      {typeError && <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--nx-danger)' }}>{typeError}</p>}
                      <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {rrqTypes.length === 0 && <p style={{ margin: 0, fontSize: '13px', color: 'var(--nx-text-muted)' }}>No types yet. Add one above.</p>}
                        {rrqTypes.map(t => (
                          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: 'var(--bg-card)', border: '1px solid var(--nx-border)', borderRadius: '6px' }}>
                            <span style={{ fontSize: '13px', color: 'var(--nx-text)' }}>{t.typeName}</span>
                            {/* Presales and Sales route incoming leads by name,
                                and deleting one stops assignment silently, so
                                they are not offered a delete button. */}
                            {isReservedRrqType(t.typeName) ? (
                              <span
                                style={{ fontSize: '11px', color: 'var(--nx-text-muted)', padding: '2px 6px' }}
                                title="Used to route incoming leads"
                              >
                                <Lock size={12} />
                              </span>
                            ) : isSuperAdmin() && (
                              <button
                                type="button"
                                onClick={() => handleDeleteType(t.id, t.typeName)}
                                style={{ background: 'none', border: 'none', color: 'var(--nx-danger)', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}
                                title="Delete"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              </div>
              <div className="modal-footer">
                <button type="submit" className="btn-submit-modal">Create RRQ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditModalOpen && editFormData && (
        <div className="modal-overlay">
          <div className="modal-content edit-modal">
            <div className="modal-header">
              <h3>Edit [{editFormData.rrqName}]</h3>
              <button className="btn-close" onClick={() => setIsEditModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleUpdate}>
              <div className="modal-body edit-body">

                {editError && (
                  <div className="rrq-form-error" role="alert">{editError}</div>
                )}

                {/* The queue points at a project that no longer exists, so the
                    Select below can match nothing and falls back to its
                    placeholder — which looked like "nothing chosen yet" rather
                    than "the saved project is gone". getRRQs already works this
                    out per row; this just says so. */}
                {editFormData.projectMissing && (
                  <div className="rrq-form-error" role="alert">
                    This queue is assigned to &quot;{editFormData.projectName}&quot;, which no longer exists,
                    so it is not assigning anyone. Choose a current project below.
                  </div>
                )}

                <div className="edit-grid">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Project Name</label>
                    <Select
                      icon={Folder}
                      value={editFormData.projectName}
                      onChange={(e) => setEditFormData({ ...editFormData, projectName: e.target.value })}
                      required
                    >
                      <option value="">Select Project</option>
                      {projectsList.map(p => <option key={p.id} value={p.projectName}>{p.projectName}</option>)}
                    </Select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">RRQ Type</label>
                    <Select
                      icon={List}
                      value={editFormData.rrqType}
                      onChange={(e) => setEditFormData({ ...editFormData, rrqType: e.target.value })}
                      required
                    >
                      <option value="">Select RRQ Type</option>
                      {rrqTypes.map(t => <option key={t.id} value={t.typeName}>{t.typeName}</option>)}
                    </Select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">RRQ Name</label>
                    <Input
                      type="text"
                      prefix={User}
                      placeholder="Enter RRQ Name"
                      value={editFormData.rrqName}
                      onChange={(e) => setEditFormData({ ...editFormData, rrqName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Add Users</label>
                    <Select
                      icon={Users}
                      onChange={handleAddUser}
                      defaultValue=""
                    >
                      <option value="" disabled>Select User</option>
                      {/* Filtered here rather than in fetchUsers: resolveAssignedUsers
                          looks ids up in the same list, and an RRQ that already
                          holds the superadmin would otherwise show a bare UUID. */}
                      {withoutSuperAdmin(availableUsers).map(u => {
                        // Built as one string: an <option> with several children
                        // is read back as a list, which is how these came out
                        // comma-separated.
                        const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ');
                        return (
                          <option key={u.id} value={u.id}>
                            {fullName ? `${u.username} (${fullName})` : u.username}
                          </option>
                        );
                      })}
                    </Select>
                  </div>
                </div>

                <div className="users-table-wrapper">
                  <table className="users-table">
                    <thead>
                      <tr>
                        <th><User size={14} style={{ marginRight: '5px', verticalAlign: 'text-bottom' }} /> RRQ Name</th>
                        <th style={{ color: 'var(--nx-danger)' }}><Trash2 size={14} style={{ marginRight: '5px', verticalAlign: 'text-bottom' }} /> Remove</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editFormData.assignedUsers.map(userId => {
                        const user = availableUsers.find(u => u.id === userId);
                        const displayName = user ? (user.username || user.firstName || userId) : userId;
                        return (
                          <tr key={userId}>
                            <td><User size={14} style={{ marginRight: '5px', verticalAlign: 'text-bottom', color: 'var(--nx-text-muted)' }} /> {displayName}</td>
                            <td>
                              <button
                                type="button"
                                className="remove-icon-btn"
                                onClick={() => handleRemoveUser(userId)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

              </div>
              <div className="modal-footer">
                <button type="submit" className="btn-submit-modal">Edit RRQ</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
