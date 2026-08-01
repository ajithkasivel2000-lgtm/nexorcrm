import { useState, useEffect } from 'react';
import { Home, Edit, Trash2, X } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import './UserGroupList.css';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const UserGroupList = () => {
  const navigate = useNavigate();
  const context = useOutletContext();
  const loggedInUser = localStorage.getItem('loggedInUser') || '';
  const pagePerm = context?.permissionsList?.find(p => p.page === 'user-groups');
  const hasExportPermission = loggedInUser === 'admin' ? true : (pagePerm ? !!pagePerm.export : true);

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
        alert(`Failed to create group: ${errData.message}`);
      }
    } catch (error) {
      console.error('Error creating group:', error);
      alert('An error occurred while creating the group.');
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
        alert(`Failed to update group: ${errData.message}`);
      }
    } catch (error) {
      console.error('Error updating group:', error);
      alert('An error occurred while updating the group.');
    }
  };

  const exportCSV = () => {
    const headers = ["Group Name", "Group Level", "# of Members"];
    const rows = groups.map((g) => [
      g.groupName || "",
      g.groupLevel || "",
      g.users ? g.users.length : 0
    ]);
    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "user_groups.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("User Groups List", 14, 15);
    const tableColumn = ["Group Name", "Group Level", "# of Members"];
    const tableRows = [];
    groups.forEach((g) => {
      tableRows.push([
        g.groupName || "-",
        g.groupLevel || "-",
        g.users ? g.users.length : 0
      ]);
    });
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });
    doc.save(`user_groups_${Date.now()}.pdf`);
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

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this group?')) {
      try {
        const response = await fetch(`/api/user-groups/${id}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          fetchGroups();
        } else {
          const err = await response.json();
          alert(`Error: ${err.message}`);
        }
      } catch (error) {
        console.error('Error deleting group:', error);
      }
    }
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

  return (
    <div className="user-group-page">
      <div className="group-header-top">
        <div className="header-left">
          <h2>User Groups</h2>
          <div className="page-breadcrumb">
            <Home size={14} className="cursor-pointer" onClick={() => navigate('/')} />
            <span className="slash">/</span>
            <span>User Groups</span>
          </div>
        </div>
        <button className="btn-create-group" onClick={() => setIsCreateModalOpen(true)}>
          Create Group
        </button>
      </div>

      <div className="group-card">
        <div className="group-card-header">
          <h3>User Groups</h3>
          <p>Create, View And Edit User Groups. Assign Users To User Groups.</p>
        </div>

        {hasExportPermission && (
          <div style={{ padding: '20px 20px 15px 20px', display: 'flex', gap: '8px' }}>
            <button
              onClick={exportCSV}
              style={{ padding: '6px 12px', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '13px', cursor: 'pointer', backgroundColor: '#7b68ee', transition: 'opacity 0.2s' }}
              onMouseEnter={(e) => e.target.style.opacity = '0.9'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              Export CSV
            </button>
            <button
              onClick={exportPDF}
              style={{ padding: '6px 12px', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '13px', cursor: 'pointer', backgroundColor: '#ef4444', transition: 'opacity 0.2s' }}
              onMouseEnter={(e) => e.target.style.opacity = '0.9'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
            >
              Export PDF
            </button>
          </div>
        )}

        <div className="table-responsive">
          <table className="group-table">
            <thead>
              <tr>
                <th>Group Name</th>
                <th>Group Level</th>
                <th># of Members</th>
                <th className="actions-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id}>
                  <td>{group.groupName}</td>
                  <td>{group.groupLevel}</td>
                  <td>{group.members?.length || 0}</td>
                  <td className="actions-cell">
                    <button className="btn-icon-action edit" onClick={() => openEditModal(group)}>
                      <Edit size={14} />
                    </button>
                    {/* Only show delete button for levels > 2 */}
                    {group.groupLevel > 2 && (
                      <button className="btn-icon-action delete" onClick={() => handleDelete(group.id)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {groups.length === 0 && (
                <tr>
                  <td colSpan="4" className="text-center">No groups found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {isCreateModalOpen && (
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
      )}

      {/* Edit Modal */}
      {isEditModalOpen && activeGroup && (
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
      )}
    </div>
  );
};

export default UserGroupList;
