import { useState, useEffect } from 'react';
import { Trash2, X } from 'lucide-react';
import './UserGroupList.css';
import { DataTable, RowActions, Page, Button } from './ui';
import usePagePermissions from './hooks/usePagePermissions';
import useLiveRefresh from './utils/useLiveRefresh';

const UserGroupList = () => {

  // Gated by this user's own permissions. See usePagePermissions.
  const { canCreate, canEdit, canDelete, canExport } = usePagePermissions('user-groups');

  const [groups, setGroups] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [createFormData, setCreateFormData] = useState({
    groupName: '',
    groupLevel: ''
  });

  const [editFormData, setEditFormData] = useState({
    groupName: '',
    groupLevel: ''
  });

  useEffect(() => {
    fetchGroups();
    fetchUsers();
  }, []);

  /* Groups and their members change from the User Admin screens too, so this
     list refetches when either does rather than holding its mount-time copy. */
  useLiveRefresh(['user-groups', 'users'], () => { fetchGroups(); fetchUsers(); });

  const fetchGroups = async () => {
    try {
      const response = await fetch('/api/user-groups');
      if (response.ok) {
        const data = await response.json();
        setGroups(data);
      }
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setAllUsers(data);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleCreateChange = (e) => {
    const { name, value } = e.target;
    setCreateFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...createFormData,
        groupLevel: parseInt(createFormData.groupLevel, 10)
      };
      const response = await fetch('/api/user-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setIsCreateModalOpen(false);
        setCreateFormData({ groupName: '', groupLevel: '' });
        fetchGroups();
      } else {
        const errData = await response.json();
        window.appAlert(`Failed to create group: ${errData.message}`);
      }
    } catch (error) {
      console.error('Error creating group:', error);
      window.appAlert('An error occurred while creating the group.');
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!activeGroup) return;

    try {
      const payload = {
        ...editFormData,
        groupLevel: parseInt(editFormData.groupLevel, 10)
      };
      const response = await fetch(`/api/user-groups/${activeGroup.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setIsEditModalOpen(false);
        setActiveGroup(null);
        fetchGroups();
      } else {
        const errData = await response.json();
        window.appAlert(`Failed to update group: ${errData.message}`);
      }
    } catch (error) {
      console.error('Error updating group:', error);
      window.appAlert('An error occurred while updating the group.');
    }
  };

  const openEditModal = (group) => {
    setActiveGroup(group);
    setEditFormData({
      groupName: group.groupName,
      groupLevel: group.groupLevel
    });
    setIsEditModalOpen(true);
    setIsDropdownOpen(false);
  };

  const handleAddUser = async (userId) => {
    if (!activeGroup) return;
    try {
      const response = await fetch(`/api/user-groups/${activeGroup.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (response.ok) {
        // Refresh active group data by re-fetching all groups
        fetchGroups();
        // Update local activeGroup state
        const updatedResponse = await fetch('/api/user-groups');
        const groupsData = await updatedResponse.json();
        const updatedGroup = groupsData.find(g => g.id === activeGroup.id);
        setActiveGroup(updatedGroup);
        setIsDropdownOpen(false);
      }
    } catch (error) {
      console.error('Error adding user:', error);
    }
  };

  const handleRemoveUser = async (userId) => {
    if (!activeGroup) return;
    try {
      const response = await fetch(`/api/user-groups/${activeGroup.id}/members/${userId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        fetchGroups();
        const updatedResponse = await fetch('/api/user-groups');
        const groupsData = await updatedResponse.json();
        const updatedGroup = groupsData.find(g => g.id === activeGroup.id);
        setActiveGroup(updatedGroup);
      }
    } catch (error) {
      console.error('Error removing user:', error);
    }
  };

  const handleDeleteSelected = async (ids, clearSelection) => {
    if (!await window.appConfirm(`Delete ${ids.length} selected group(s)?`)) return;
    try {
      const responses = await Promise.all(
        ids.map(id => fetch(`/api/user-groups/${id}`, { method: 'DELETE' }))
      );
      clearSelection();
      fetchGroups();
      const failed = responses.filter(r => !r.ok).length;
      if (failed > 0) {
        window.appAlert(`${failed} of ${ids.length} group(s) could not be deleted.`);
      }
    } catch (err) {
      console.error('Failed to delete selected groups:', err);
      window.appAlert('Could not reach the server.');
    }
  };

  const groupColumns = [
    {
      key: 'groupName',
      label: 'Group Name',
      render: g => <span className="nx-page__strong">{g.groupName || '—'}</span>,
    },
    { key: 'groupLevel', label: 'Group Level', width: '150px' },
    {
      key: 'members',
      label: '# of Members',
      width: '150px',
      render: g => g.members?.length || 0,
      sortValue: g => g.members?.length || 0,
      exportValue: g => String(g.members?.length || 0),
    },
  ];

  return (
    <Page
      title="User Groups"
      actions={canCreate ? (
        <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
          Create Group
        </Button>
      ) : null}
    >
      <DataTable
        columns={groupColumns}
        rows={groups}
        exportName={canExport ? 'user-groups' : undefined}
        persistKey="user-groups"
        filters={['groupLevel']}
        tabsFrom="groupLevel"
        onDeleteSelected={canDelete ? handleDeleteSelected : undefined}
        searchPlaceholder="Search group name..."
        emptyMessage="No groups yet"
        emptyHint="Create a group to organise your users."
        actions={group => (
          <RowActions
            label={group.groupName || 'group'}
            onEdit={canEdit ? () => openEditModal(group) : undefined}
          />
        )}
      />

      {/* Create Modal */}
      {
        isCreateModalOpen && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header">
                <h3>Create New Group</h3>
                <button className="btn-close" onClick={() => setIsCreateModalOpen(false)}>
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleCreateSubmit}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>New Group Name :</label>
                    <input
                      type="text"
                      name="groupName"
                      placeholder="Group Name"
                      value={createFormData.groupName}
                      onChange={handleCreateChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Assign Group Level :</label>
                    <input
                      type="number"
                      name="groupLevel"
                      placeholder="Group Level - Enter a number between 3 - 256"
                      min="3" max="256"
                      value={createFormData.groupLevel}
                      onChange={handleCreateChange}
                      required
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="submit" className="btn-submit">Create Group</button>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {/* Edit Modal */}
      {
        isEditModalOpen && activeGroup && (
          <div className="modal-overlay">
            <div className="modal-content edit-group-modal">
              <div className="modal-header">
                <h3>Edit Group</h3>
                <button className="btn-close" onClick={() => setIsEditModalOpen(false)}>
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleEditSubmit}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>Group Name :</label>
                    <input
                      type="text"
                      name="groupName"
                      value={editFormData.groupName}
                      onChange={handleEditChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Group Level :</label>
                    <input
                      type="number"
                      name="groupLevel"
                      value={editFormData.groupLevel}
                      onChange={handleEditChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Add Users :</label>
                    <div className="custom-dropdown-container">
                      <div
                        className="dropdown-trigger"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      >
                        Select Add Users
                      </div>
                      {isDropdownOpen && (
                        <div className="dropdown-menu">
                          <div className="dropdown-item active-item" onClick={() => setIsDropdownOpen(false)}>Select Add Users</div>
                          {allUsers.filter(u => !activeGroup.members.some(m => m.id === u.id)).map(user => (
                            <div
                              key={user.id}
                              className="dropdown-item"
                              onClick={() => handleAddUser(user.id)}
                            >
                              {user.username}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="members-table-container">
                    <table className="members-table">
                      <thead>
                        <tr>
                          <th>Username</th>
                          <th className="text-center">Remove</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeGroup.members.map(member => (
                          <tr key={member.id}>
                            <td>{member.username}</td>
                            <td className="text-center">
                              <button
                                type="button"
                                className="btn-remove-member"
                                onClick={() => handleRemoveUser(member.id)}
                              >
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {activeGroup.members.length === 0 && (
                          <tr>
                            <td colSpan="2" className="text-center" style={{ padding: '10px', fontSize: '12px' }}>No members</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                </div>

                <div className="modal-footer">
                  <button type="submit" className="btn-submit">Edit Group</button>
                </div>
              </form>
            </div>
          </div>
        )
      }
    </Page >
  );
};

export default UserGroupList;
