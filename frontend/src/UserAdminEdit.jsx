import { useState, useEffect } from 'react';
import { Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const UserAdminEdit = ({ user, onBack }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('general-info');
  const [formData, setFormData] = useState({
    username: user.username || '',
    firstName: user.firstName || user.firstname || '',
    lastName: user.lastName || user.lastname || '',
    password: '',
    confirmPassword: '',
    email: user.email || '',
    phone: user.phone || '',
    userlevel: user.userlevel || '',
    dept_id: user.dept_id || '',
    reporting_to: user.reporting_to || '',
    user_home_path: user.user_home_path || user.homePagePath || ''
  });

  const [fullUser, setFullUser] = useState(user);
  const [allGroups, setAllGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [homePagePath, setHomePagePath] = useState('');

  const [sessions, setSessions] = useState([]);
  const [selectedSessions, setSelectedSessions] = useState([]);

  const [logs, setLogs] = useState([]);
  const [loggedInRole, setLoggedInRole] = useState('Manager');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    const loggedInUser = localStorage.getItem('loggedInUser');
    if (loggedInUser) {
      if (loggedInUser === 'admin') {
        setLoggedInRole('Admin');
        setIsSuperAdmin(true);
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

  useEffect(() => {
    fetch(`/api/users/${user.id}`)
      .then(res => res.json())
      .then(data => {
        setFullUser(data);
        if (data.userGroups) {
          setSelectedGroups(data.userGroups.map(g => g.id));
        }
        setHomePagePath(data.homePagePath || '');
      })
      .catch(err => console.error(err));

    fetch('/api/user-groups')
      .then(res => res.json())
      .then(data => setAllGroups(data))
      .catch(err => console.error(err));
  }, [user.id]);

  useEffect(() => {
    if (activeTab === 'active-sessions') {
      fetch(`/api/sessions/user/${user.username}`)
        .then(res => res.json())
        .then(data => setSessions(data))
        .catch(err => console.error(err));
    } else if (activeTab === 'logs') {
      fetch(`/api/logs/user/${user.username}`)
        .then(res => res.json())
        .then(data => setLogs(data))
        .catch(err => console.error(err));
    }
  }, [activeTab, user.username]);

  const handleGroupSubmit = async () => {
    try {
      const res = await fetch(`/api/users/${user.id}/groups`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds: selectedGroups })
      });
      if (res.ok) alert('Groups updated successfully!');
      else alert('Failed to update groups');
    } catch (err) {
      console.error(err);
    }
  };

  const handleHomePageSubmit = async () => {
    try {
      const res = await fetch(`/api/users/${user.id}/homepage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homePagePath })
      });
      if (res.ok) alert('Home page updated successfully!');
      else alert('Failed to update home page');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSessions = async () => {
    if (!selectedSessions.length) return;
    if (!window.confirm('Delete selected sessions?')) return;
    try {
      const res = await fetch('/api/sessions/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionIds: selectedSessions })
      });
      if (res.ok) {
        setSessions(sessions.filter(s => !selectedSessions.includes(s.id)));
        setSelectedSessions([]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Validation helpers (shared for create & edit)
  const validateUsername = (username) => {
    if (!username) return 'Username is required.';
    if (username.length < 5) return 'Username must be at least 5 characters.';
    return '';
  };

  const validatePassword = (password) => {
    if (!password) return '';
    if (password.length < 10) return 'Password must be at least 10 characters.';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) return 'Password must contain at least one special character.';
    return '';
  };

  const handleStatusAction = async (action) => {
    let confirmMessage = '';
    if (action.includes('promote') || action.includes('demote')) {
      confirmMessage = 'Are you sure you want to promote or demote this user?\n\nClick OK to continue or Cancel to Abort!';
    } else {
      confirmMessage = `Are you sure you want to ${action} this user?\n\nClick OK to continue or Cancel to Abort!`;
    }

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const response = await fetch(`/api/users/${user.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (response.ok) {
        const data = await response.json();
        alert(`User role updated to ${data.status} (userlevel: ${data.userlevel})`);
        onBack();
      } else {
        const err = await response.json();
        alert(`Error: ${err.message}`);
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        const response = await fetch(`/api/users/${user.id}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          onBack();
        }
      } catch (error) {
        console.error('Error deleting user:', error);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Username validation
    const usernameError = validateUsername(formData.username);
    if (usernameError) { alert(usernameError); return; }

    // Password validation (only if a new password is being set)
    if (formData.password) {
      const passwordError = validatePassword(formData.password);
      if (passwordError) { alert(passwordError); return; }
      if (formData.password !== formData.confirmPassword) {
        alert("Passwords don't match!");
        return;
      }
    }

    try {
      const dataToSend = { ...formData };
      delete dataToSend.confirmPassword;
      if (!dataToSend.password) {
        delete dataToSend.password;
      }

      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSend),
      });

      if (response.ok) {
        alert('Account updated successfully.');
        onBack();
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.message}`);
      }
    } catch (error) {
      console.error('Error updating user:', error);
      alert('An error occurred while updating the account.');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
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

  return (
    <div className="user-admin-page">
      <div className="user-admin-header-top" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '15px' }}>
        <div className="header-left">
          <h2>User Edit</h2>
          <div className="page-breadcrumb">
            <Home size={14} className="cursor-pointer" onClick={() => navigate('/')} />
            <span className="slash">/</span>
            <span className="cursor-pointer" style={{ color: '#4a72ff', fontWeight: 500 }} onClick={onBack}>User Admin</span>
            <span className="slash">/</span>
            <span>User Edit</span>
          </div>
        </div>

        <div className="header-actions" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', width: '100%' }}>

          {/* SUPERADMIN & ADMIN VIEW */}
          {loggedInRole === 'Admin' &&
            !(isSuperAdmin && user.username === localStorage.getItem('loggedInUser')) && (
              <>
                {isSuperAdmin && (
                  <button
                    className="user-admin-btn outline"
                    onClick={() => handleStatusAction('promoteToAdmin')}
                  >
                    <span className="icon">↑</span> Promote to Admin
                  </button>
                )}

                <button
                  className="user-admin-btn outline"
                  onClick={() => handleStatusAction('promoteToManager')}
                >
                  <span className="icon">↑</span> Promote to Manager
                </button>

                <button
                  className="user-admin-btn outline"
                  onClick={() => handleStatusAction('demoteToEmployee')}
                >
                  <span className="icon">↑</span> Promote to User
                </button>

                <button className="user-admin-btn red" onClick={handleDelete}>
                  <span className="icon">✖</span> Delete User
                </button>
              </>
            )}

          {/* BAN USER is visible to Superadmin, Admin, and Manager (if target is not Employee) */}
          {loggedInRole !== 'Employee' &&
            (loggedInRole === 'Admin' || user.status !== 'Employee') &&
            !(isSuperAdmin && user.username === localStorage.getItem('loggedInUser')) && (
              <button
                className={`user-admin-btn ${user.status === 'Banned' ? 'btn-purple' : 'orange'}`}
                onClick={() =>
                  handleStatusAction(user.status === 'Banned' ? 'unban' : 'ban')
                }
              >
                <span className="icon">✖</span>
                {user.status === 'Banned' ? 'UnBan User' : 'Ban User'}
              </button>
            )}

          {/* MANAGER VIEW (Only if logged in user is Manager) */}
          {loggedInRole === 'Manager' && (
            <>
              {user.status === 'Manager' && (
                <button className="user-admin-btn outline" onClick={() => handleStatusAction('demoteToEmployee')}>
                  <span className="icon">↑</span> Promote to User
                </button>
              )}
              {user.status === 'Employee' && (
                <button className="user-admin-btn outline" onClick={() => handleStatusAction('demoteToRegistered')}>
                  <span className="icon">↑</span> Promote to User
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="user-admin-card edit-card">
        <div className="user-admin-tabs border-bottom">
          <button className={`tab-btn ${activeTab === 'general-info' ? 'active' : ''}`} onClick={() => setActiveTab('general-info')}>
            General Info
          </button>
          <button className={`tab-btn ${activeTab === 'group-membership' ? 'active' : ''}`} onClick={() => setActiveTab('group-membership')}>
            Group Membership
          </button>
          <button className={`tab-btn ${activeTab === 'home-page' ? 'active' : ''}`} onClick={() => setActiveTab('home-page')}>
            Home Page
          </button>
          <button className={`tab-btn ${activeTab === 'active-sessions' ? 'active' : ''}`} onClick={() => setActiveTab('active-sessions')}>
            Active Sessions
          </button>
          <button className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
            Logs
          </button>
        </div>

        {activeTab === 'general-info' && (
          <div className="general-info-container">
            <div className="profile-column">
              <h3>My Profile</h3>
              <div className="profile-details">
                <div className="detail-row">
                  <span className="detail-label">Username:</span>
                  <span className="detail-value">{fullUser.username}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Status:</span>
                  <span className="detail-value text-green">{fullUser.status}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">E-mail:</span>
                  <span className="detail-value text-purple">{fullUser.email || '-'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Last Active:</span>
                  <span className="detail-value">{formatDate(fullUser.lastLoginAt)}</span>
                </div>
              </div>
            </div>

            <div className="edit-account-column">
              <div className="edit-card-inner">
                <h3>Edit Account</h3>
                <form onSubmit={handleSubmit}>
                  <div className="form-group-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                    <label>Username:</label>
                    <input
                      type="text"
                      name="username"
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
                  <div className="form-group-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                    <label>New Password:</label>
                    <input
                      type="password"
                      name="password"
                      placeholder="Leave blank to keep current"
                      value={formData.password}
                      onChange={handleInputChange}
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
                  <div className="form-group-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                    <label>Confirm Password:</label>
                    <input
                      type="password"
                      name="confirmPassword"
                      placeholder="Confirm Password"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      style={{ borderColor: formData.confirmPassword && formData.confirmPassword !== formData.password ? '#ef4444' : '' }}
                    />
                    {formData.confirmPassword && formData.confirmPassword !== formData.password && (
                      <small style={{ color: '#ef4444', fontSize: '11px' }}>Passwords do not match.</small>
                    )}
                  </div>
                  <div className="form-group-row">
                    <label>E-mail:</label>
                    <input type="email" name="email" value={formData.email} onChange={handleInputChange} required />
                  </div>


                  <div className="form-actions right">
                    <button type="submit" className="btn-purple-full small">Submit Changes</button>
                    <button type="button" className="btn-purple-full small outline" onClick={() => setFormData({
                      username: user.username,
                      firstName: user.firstName || user.firstname || '',
                      lastName: user.lastName || user.lastname || '',
                      password: '',
                      confirmPassword: '',
                      email: user.email,
                      phone: user.phone || '',
                      userlevel: user.userlevel || '',
                      dept_id: user.dept_id || '',
                      reporting_to: user.reporting_to || '',
                      user_home_path: user.user_home_path || user.homePagePath || ''
                    })}>Reset</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'group-membership' && (
          <div className="group-membership-container" style={{ padding: '20px' }}>
            <p style={{ marginBottom: '5px' }}>Edit the User's Group Membership</p>
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '15px' }}>Click the text box below to add the user to more groups...</p>
            <p style={{ marginBottom: '5px' }}>Current Groups</p>
            <select
              multiple
              value={selectedGroups}
              onChange={(e) => {
                const options = Array.from(e.target.options);
                setSelectedGroups(options.filter(o => o.selected).map(o => o.value));
              }}
              style={{ width: '200px', height: '120px', padding: '5px', marginBottom: '20px', border: '1px solid #ddd', borderRadius: '4px' }}
            >
              {allGroups.map(g => (
                <option key={g.id} value={g.id}>{g.groupName}</option>
              ))}
            </select>
            <div>
              <button className="btn-purple-full small" onClick={handleGroupSubmit}>Submit Changes</button>
            </div>
          </div>
        )}

        {activeTab === 'home-page' && (
          <div className="home-page-container" style={{ padding: '20px' }}>
            <h4 style={{ marginBottom: '15px', color: '#333' }}>Unique User Home Page - Settings</h4>

            <div style={{ marginBottom: '15px' }}>
              <span style={{ fontWeight: '500', display: 'block', marginBottom: '5px' }}>Current Status :</span>
              <span style={{ color: '#666' }}>Off - but set centrally by Admin</span>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <span style={{ fontWeight: '500', display: 'block', marginBottom: '5px' }}>Path :</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="text"
                  value={homePagePath}
                  onChange={e => setHomePagePath(e.target.value)}
                  placeholder="Set here"
                  style={{ width: '400px', padding: '8px 12px', border: '1px dotted #ccc', borderRadius: '4px' }}
                />
                <span style={{ color: '#666', fontSize: '13px' }}>Use ../ to go back a folder</span>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <span style={{ fontWeight: '500', display: 'block', marginBottom: '5px' }}>Current Full Path :</span>
              <span style={{ color: '#666' }}>{homePagePath ? homePagePath : 'Not set'}</span>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <span style={{ fontWeight: '500', display: 'block', marginBottom: '5px' }}>Instructions :</span>
              <p style={{ color: '#666', fontSize: '13px', lineHeight: '1.5', maxWidth: '800px' }}>
                The path you choose should be set relative to the admin folder (which will be your Site Root, set in the General Settings page in the Control Panel). Therefore you'll most likely want to go back a folder before choosing any subfolder you create for the unique user pages. Use ../ to go back a folder. So for example, if you site's admin control panel is here - <i>http://www.website.com/admin/</i> and your user folders are here - <i>http://www.website.com/users/</i> you'll want to set the path setting to <i>../users/</i> along with your unique page - so <i>../users/admin.php</i>. The full path will then display as <i>http://www.website.com/admin/../users/admin.php</i> - the folder/file will actually be located at <i>http://www.website.com/users/admin.php</i>.
              </p>
            </div>

            <button className="btn-purple-full small" onClick={handleHomePageSubmit}>Submit Changes</button>
          </div>
        )}

        {activeTab === 'active-sessions' && (
          <div className="active-sessions-container" style={{ padding: '0px' }}>
            <table className="user-admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      onChange={e => {
                        if (e.target.checked) setSelectedSessions(sessions.map(s => s.id));
                        else setSelectedSessions([]);
                      }}
                      checked={sessions.length > 0 && selectedSessions.length === sessions.length}
                    />
                  </th>
                  <th>Last IP Address</th>
                  <th>Persistent ?</th>
                  <th>Last Update</th>
                  <th>Session Expiry</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(session => (
                  <tr key={session.id}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedSessions.includes(session.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedSessions([...selectedSessions, session.id]);
                          else setSelectedSessions(selectedSessions.filter(id => id !== session.id));
                        }}
                      />
                    </td>
                    <td>{session.ipAddress}</td>
                    <td>{session.persistent ? 'Yes' : 'No'}</td>
                    <td>{formatDate(session.lastActive)}</td>
                    <td>{formatDate(session.expiry)}</td>
                  </tr>
                ))}
                {sessions.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>No active sessions found.</td>
                  </tr>
                )}
              </tbody>
            </table>

            <div style={{ padding: '15px' }}>
              <button
                onClick={handleDeleteSessions}
                style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '14px', fontWeight: '500' }}
              >
                <span style={{ fontSize: '16px' }}>✖</span> Delete Selected Sessions
              </button>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="logs-container" style={{ padding: '0px' }}>
            <table className="user-admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Event</th>
                  <th>Date / Time</th>
                  <th>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td>{log.username}</td>
                    <td>{log.event}</td>
                    <td>{formatDate(log.createdAt)}</td>
                    <td>{log.ipAddress}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>No logs found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserAdminEdit;
