import { useState, useEffect } from 'react';
import { Home, Edit2, X } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const UserAdminList = ({ onEdit }) => {
  const navigate = useNavigate();
  const context = useOutletContext();
  const loggedInUser = localStorage.getItem('loggedInUser') || '';
  const pagePerm = context?.permissionsList?.find(p => p.page === 'user-admin');
  const hasExportPermission = loggedInUser === 'admin' ? true : (pagePerm ? !!pagePerm.export : true);

  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('user-table');
  const [selectedPendingUsers, setSelectedPendingUsers] = useState([]);
  const [loggedInRole, setLoggedInRole] = useState('Manager');

  const [formData, setFormData] = useState({
    username: '',
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
    email: '',
    confirmEmail: ''
  });

  useEffect(() => {
    fetchUsers();
    fetchSessions();

    const loggedInUser = localStorage.getItem('loggedInUser');
    if (loggedInUser) {
      if (loggedInUser === 'admin') {
        setLoggedInRole('Admin');
      } else {
        fetch(`/api/users/username/${loggedInUser}`)
          .then(res => res.json())
          .then(data => {
            if (data && data.status) {
              setLoggedInRole(data.status);
            }
          })
          .catch(err => console.error(err));
      }
    }
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await fetch('/api/sessions');
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Validation helpers
  const validateUsername = (username) => {
    if (!username) return 'Username is required.';
    if (username.length < 5) return 'Username must be at least 5 characters.';
    return '';
  };

  const validatePassword = (password) => {
    if (!password) return 'Password is required.';
    if (password.length < 10) return 'Password must be at least 10 characters.';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) return 'Password must contain at least one special character.';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const usernameError = validateUsername(formData.username);
    if (usernameError) { alert(usernameError); return; }

    const passwordError = validatePassword(formData.password);
    if (passwordError) { alert(passwordError); return; }

    if (formData.password !== formData.confirmPassword) {
      alert("Passwords don't match!");
      return;
    }
    if (formData.email !== formData.confirmEmail) {
      alert("Emails don't match!");
      return;
    }

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsModalOpen(false);
        setFormData({
          username: '', firstName: '', lastName: '', password: '',
          confirmPassword: '', email: '', confirmEmail: ''
        });
        fetchUsers();
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.message}`);
      }
    } catch (error) {
      console.error('Error creating user:', error);
    }
  };

  const handleDeleteInactive = async () => {
    const confirmed = window.confirm("Are you sure you want to delete all users inactive for more than 30 days?");
    if (confirmed) {
      try {
        const response = await fetch('/api/users/delete-inactive', {
          method: 'DELETE',
        });
        if (response.ok) {
          const data = await response.json();
          alert(`${data.deletedCount} inactive users deleted.`);
          fetchUsers();
        }
      } catch (error) {
        console.error('Error deleting inactive users:', error);
      }
    }
  };

  const exportCSV = () => {
    const headers = ["Sl. No", "Username", "Status", "E-mail", "Last Login"];
    const rows = activeUsers.map((user, index) => [
      index + 1,
      user.username || "",
      user.status || "",
      user.email || "",
      user.lastLoginAt ? formatDate(user.lastLoginAt) : "Never"
    ]);
    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "user_list.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("User Administration List", 14, 15);
    const tableColumn = ["Sl. No", "Username", "Status", "E-mail", "Last Login"];
    const tableRows = [];
    activeUsers.forEach((user, index) => {
      tableRows.push([
        index + 1,
        user.username || "-",
        user.status || "-",
        user.email || "-",
        user.lastLoginAt ? formatDate(user.lastLoginAt) : "Never"
      ]);
    });
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });
    doc.save(`user_list_${Date.now()}.pdf`);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const month = date.toLocaleString('default', { month: 'short' });
    const day = date.getDate();
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${month} ${day}, ${year}, ${hours}:${minutes} ${ampm}`;
  };

  const handleCheckboxChange = (userId) => {
    setSelectedPendingUsers(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  const handleActivateUsers = async () => {
    if (selectedPendingUsers.length === 0) return;
    try {
      const response = await fetch('/api/users/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: selectedPendingUsers })
      });
      if (response.ok) {
        setSelectedPendingUsers([]);
        fetchUsers();
      }
    } catch (error) {
      console.error('Error activating users:', error);
    }
  };

  const isSuperAdmin = loggedInUser === 'admin';

  const filterForLoggedInUser = (uList) => {
    if (isSuperAdmin) {
      return uList;
    }
    if (loggedInRole === 'Admin') {
      // DB Admin sees only Manager and Employee/User, no Admins and no admin
      return uList.filter(u => u.status !== 'Admin' && u.username !== 'admin');
    }
    if (loggedInRole === 'Manager') {
      // Manager sees only Employee/User
      return uList.filter(u => u.status !== 'Admin' && u.status !== 'Manager' && u.username !== 'admin');
    }
    // Employee sees nothing (though they shouldn't access)
    return [];
  };

  const pendingUsers = filterForLoggedInUser(users.filter(u => u.status === 'Pending'));
  const activeUsers = filterForLoggedInUser(users.filter(u => u.status !== 'Pending'));

  return (
    <div className="user-admin-page">
      <div className="user-admin-header-top">
        <div className="header-left">
          <h2>User Admin</h2>
          <div className="page-breadcrumb">
            <Home size={14} className="cursor-pointer" onClick={() => navigate('/')} />
            <span className="slash">/</span>
            <span>User Admin</span>
          </div>
        </div>
        {loggedInRole !== 'Employee' && (
          <div className="header-actions">
            <button className="btn-purple" onClick={() => setIsModalOpen(true)}>Create User</button>
            <button className="btn-purple" onClick={handleDeleteInactive}>Delete Inactive Users</button>
          </div>
        )}
      </div>

      <div className="user-admin-card">
        <div className="user-admin-card-header">
          <p>Manage Your Users. Click The Tabs To See The Other Tables.</p>
        </div>

        {activeTab === 'user-table' && hasExportPermission && (
          <div style={{ padding: '0 20px 15px 20px', display: 'flex', gap: '8px' }}>
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

        <div className="user-admin-tabs">
          <button
            className={`tab-btn ${activeTab === 'user-table' ? 'active' : ''}`}
            onClick={() => setActiveTab('user-table')}
          >
            User Table
          </button>
          <button
            className={`tab-btn ${activeTab === 'awaiting' ? 'active' : ''}`}
            onClick={() => setActiveTab('awaiting')}
          >
            Users Awaiting Activation
          </button>
          <button
            className={`tab-btn ${activeTab === 'sessions' ? 'active' : ''}`}
            onClick={() => setActiveTab('sessions')}
          >
            Current Sessions
          </button>
        </div>

        {activeTab === 'user-table' && (
          <div className="tab-content">
            <h3 className="table-title">User's Table</h3>
            <div className="table-responsive">
              <table className="user-table">
                <thead>
                  <tr>
                    <th>Sl. No</th>
                    <th>Username</th>
                    <th>Status</th>
                    <th>E-mail</th>
                    <th>Last Login</th>
                    {loggedInRole !== 'Employee' && <th className="actions-header">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {activeUsers.length > 0 ? (
                    activeUsers.map((user, index) => (
                      <tr key={user.id}>
                        <td>{index + 1}</td>
                        <td className="text-purple">{user.username}</td>
                        <td className="text-green">{user.status}</td>
                        <td className="text-purple">{user.email || '-'}</td>
                        <td>{user.lastLoginAt ? formatDate(user.lastLoginAt) : '-'}</td>
                        {loggedInRole !== 'Employee' && (
                          <td className="actions-cell">
                            <button
                              className="btn-edit-user"
                              onClick={() => onEdit(user)}
                            >
                              <Edit2 size={12} /> Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={loggedInRole !== 'Employee' ? 6 : 5} className="text-center">No users found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {activeTab === 'awaiting' && (
          <div className="tab-content">
            <h3 className="table-title">Users Awaiting Activation</h3>
            <div className="table-responsive">
              <table className="user-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input type="checkbox" />
                    </th>
                    <th>Username</th>
                    <th>E-mail</th>
                    <th>Registered</th>
                    <th>IP Address</th>
                    <th className="actions-header">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingUsers.length > 0 ? (
                    pendingUsers.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedPendingUsers.includes(user.id)}
                            onChange={() => handleCheckboxChange(user.id)}
                          />
                        </td>
                        <td>{user.username}</td>
                        <td>{user.email}</td>
                        <td>{formatDate(user.createdAt)}</td>
                        <td>{user.registeredIp}</td>
                        <td className="actions-cell">
                          {/* Actions if any */}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="text-center"></td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="activate-action-bar">
                <span className="activate-text cursor-pointer" onClick={handleActivateUsers}>
                  Activate Users
                </span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sessions' && (
          <div className="tab-content">
            <h3 className="table-title">Current Sessions</h3>
            <div className="table-responsive">
              <table className="user-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input type="checkbox" />
                    </th>
                    <th>Username</th>
                    <th>Last IP Address</th>
                    <th>Last</th>
                    <th>Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.length > 0 ? (
                    sessions.map((session) => (
                      <tr key={session.id}>
                        <td>
                          <input type="checkbox" />
                        </td>
                        <td>{session.username}</td>
                        <td>{session.ipAddress}</td>
                        <td>{formatDate(session.lastActive)}</td>
                        <td>{formatDate(session.expiry)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="text-center">No current sessions found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content user-modal">
            <div className="modal-header">
              <h3>Create New User</h3>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Username:</label>
                  <input
                    type="text"
                    name="username"
                    placeholder="e.g. JohnDoe"
                    value={formData.username}
                    onChange={handleInputChange}
                    required
                    style={{ borderColor: formData.username && validateUsername(formData.username) ? '#ef4444' : '' }}
                  />
                  {formData.username && validateUsername(formData.username) ? (
                    <small style={{ color: '#ef4444', fontSize: '11px' }}>{validateUsername(formData.username)}</small>
                  ) : (
                    <small style={{ color: '#6b7280', fontSize: '11px' }}>Min 5 characters</small>
                  )}
                </div>

                <div className="form-group">
                  <label>New Password:</label>
                  <input
                    type="password"
                    name="password"
                    placeholder="Min 10 chars, number & special char"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                    style={{ borderColor: formData.password && validatePassword(formData.password) ? '#ef4444' : '' }}
                  />
                  {formData.password && validatePassword(formData.password) ? (
                    <small style={{ color: '#ef4444', fontSize: '11px' }}>{validatePassword(formData.password)}</small>
                  ) : formData.password ? (
                    <small style={{ color: '#10b981', fontSize: '11px' }}>✓ Password looks good</small>
                  ) : (
                    <small style={{ color: '#6b7280', fontSize: '11px' }}>Min 10 chars · 1 number · 1 special character</small>
                  )}
                </div>
                <div className="form-group">
                  <label>Confirm Password:</label>
                  <input
                    type="password"
                    name="confirmPassword"
                    placeholder="Confirm Password"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    required
                    style={{ borderColor: formData.confirmPassword && formData.confirmPassword !== formData.password ? '#ef4444' : '' }}
                  />
                  {formData.confirmPassword && formData.confirmPassword !== formData.password && (
                    <small style={{ color: '#ef4444', fontSize: '11px' }}>Passwords do not match.</small>
                  )}
                </div>
                <div className="form-group">
                  <label>E-mail:</label>
                  <input type="email" name="email" placeholder="E-mail" value={formData.email} onChange={handleInputChange} required />
                </div>
                <div className="form-group">
                  <label>Confirm E-mail:</label>
                  <input
                    type="email"
                    name="confirmEmail"
                    placeholder="Confirm E-mail"
                    value={formData.confirmEmail}
                    onChange={handleInputChange}
                    required
                    style={{ borderColor: formData.confirmEmail && formData.confirmEmail !== formData.email ? '#ef4444' : '' }}
                  />
                  {formData.confirmEmail && formData.confirmEmail !== formData.email && (
                    <small style={{ color: '#ef4444', fontSize: '11px' }}>Emails do not match.</small>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button type="submit" className="btn-purple-full">Create New User</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserAdminList;
