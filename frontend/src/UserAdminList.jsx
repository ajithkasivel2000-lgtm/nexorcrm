import { useState, useEffect } from 'react';
import { subscribeDataChanged } from './utils/dataBus';

/* The statuses that mean "made, but not yet allowed in". Kept in step with
   userController.js, which creates accounts as 'Registered' and activates
   either value. */
const AWAITING_ACTIVATION = ['Registered', 'Pending'];
import { Eye, EyeOff } from 'lucide-react';
import { Button, DataTable, DEFAULT_DIAL, Field, FormGrid, Input, Modal, Page, PhoneInput, Pill, RecordAvatarField, RowActions, emailError, normalizeEmail, toneForStatus, validateNumber } from './ui';

const UserAdminList = ({ onEdit }) => {
  const loggedInUser = localStorage.getItem('loggedInUser') || '';

  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('user-table');
  const [loggedInRole, setLoggedInRole] = useState('Manager');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [formData, setFormData] = useState({
    username: '',
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
    email: '',
    phone: '',
    phoneCountryCode: DEFAULT_DIAL,
    profile_image: ''
  });

  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast({ visible: false, message: '', type: 'success' }), 4000);
  };

  /* Users and sessions change from more places than this screen: the 360 page
     promotes someone, another tab creates an account, a session is revoked.
     Rather than only reloading on mount — which is why a promotion needed a
     page refresh to show — refetch whenever either is written to. */
  useEffect(() => subscribeDataChanged(['users', 'sessions', 'user-permissions'], () => {
    fetchUsers();
    fetchSessions();
  }), []);

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
    if (usernameError) { window.appAlert(usernameError); return; }

    const badEmail = emailError(formData.email, { required: true, label: 'E-mail' });
    if (badEmail) { window.appAlert(badEmail); return; }

    const passwordError = validatePassword(formData.password);
    if (passwordError) { window.appAlert(passwordError); return; }

    // Optional, but a number that is there has to be a real one — the server
    // rejects it otherwise and the whole create fails.
    const badPhone = validateNumber(formData.phone, formData.phoneCountryCode, { required: false });
    if (badPhone) { window.appAlert(badPhone); return; }

    if (formData.password !== formData.confirmPassword) {
      window.appAlert("Passwords don't match!");
      return;
    }

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, email: normalizeEmail(formData.email) }),
      });

      if (response.ok) {
        setIsModalOpen(false);
        setFormData({
          username: '', firstName: '', lastName: '', password: '',
          confirmPassword: '', email: '', phone: '',
          phoneCountryCode: DEFAULT_DIAL, profile_image: ''
        });
        fetchUsers();
        showToast('User created successfully!');

        const created = await response.json().catch(() => ({}));

        /* Show the tab the new account actually landed in. A new user starts
           as Pending, so staying on User Table meant the person who had just
           created one saw nothing change and assumed it had failed. */
        setActiveTab(
          !created?.status || AWAITING_ACTIVATION.includes(created.status) ? 'awaiting' : 'user-table',
        );

        // A domain that cannot receive mail is refused outright; this is the
        // softer case — it works, but it looks like a typo, and a wrong
        // address here means this person never gets a lead notification.
        if (created.emailWarning) window.appAlert(created.emailWarning, 'Check the email address');
      } else {
        const errorData = await response.json();
        window.appAlert(`Error: ${errorData.message}`);
      }
    } catch (error) {
      console.error('Error creating user:', error);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    if (isNaN(date.getTime()) || dateString === 'Invalid Date') return '—';
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

  const handleActivateUsers = async (userIds) => {
    if (!userIds || userIds.length === 0) return;
    try {
      const response = await fetch('/api/users/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds })
      });
      /* Report the outcome either way. The row leaving the tab is the only
         other signal a click gives, so a rejected activation — 403 for a
         non-Admin, 500 — would otherwise read as a dead button. */
      if (response.ok) {
        fetchUsers();
        showToast(userIds.length === 1
          ? 'User activated.'
          : `${userIds.length} users activated.`);
      } else {
        const data = await response.json().catch(() => ({}));
        showToast(data.message || 'Could not activate. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Error activating users:', error);
      showToast('Could not activate. Please try again.', 'error');
    }
  };

  const isSuperAdmin = loggedInUser === 'admin';

  const filterForLoggedInUser = (uList) => {
    // Hide the 'admin' / superadmin account from all lists permanently
    const visibleList = uList.filter(u => u.username !== 'admin');

    if (isSuperAdmin) {
      return visibleList;
    }
    if (loggedInRole === 'Admin') {
      // DB Admin sees only Manager and Employee/User, no Admins
      return visibleList.filter(u => u.status !== 'Admin');
    }
    if (loggedInRole === 'Manager') {
      // Manager sees only Employee/User
      return visibleList.filter(u => u.status !== 'Admin' && u.status !== 'Manager');
    }
    // Employee sees nothing (though they shouldn't access)
    return [];
  };

  /* An account that cannot sign in yet.
     The backend creates one as 'Registered' (userController.js) and its
     activate endpoint accepts 'Registered' and 'Pending' alike — but this tab
     matched only 'Pending', so a newly created user never appeared in it. The
     count sat at 0 while the account sat in the User Table looking active,
     with no way to reach the control that activates it. */
  const pendingUsers = filterForLoggedInUser(users.filter(u => AWAITING_ACTIVATION.includes(u.status)));
  const activeUsers = filterForLoggedInUser(users.filter(u => !AWAITING_ACTIVATION.includes(u.status)));

  /* The tab badge and the table have to read the same list. The badge counted
     every session row while the table hid the superadmin's, so signing in as
     'admin' — whose own session is the only one open on a quiet install — put
     a 1 on the tab above an empty table. */
  const visibleSessions = sessions.filter(sn => sn.username !== 'admin');

  const activeUserColumns = [
    {
      key: 'username',
      label: 'Username',
      render: u => <span className="nx-page__strong">{u.username || '—'}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      width: '150px',
      render: u => (u.status ? <Pill tone={toneForStatus(u.status)} dot>{u.status}</Pill> : '—'),
      exportValue: u => u.status || '',
    },
    {
      key: 'email',
      label: 'E-mail',
      render: u => <span className="nx-page__muted">{u.email || '—'}</span>,
    },
    {
      key: 'lastLoginAt',
      label: 'Last Login',
      width: '190px',
      render: u => (u.lastLoginAt ? formatDate(u.lastLoginAt) : '—'),
      exportValue: u => (u.lastLoginAt ? formatDate(u.lastLoginAt) : ''),
    },
  ];

  const pendingUserColumns = [
    {
      key: 'username',
      label: 'Username',
      render: u => <span className="nx-page__strong">{u.username || '—'}</span>,
    },
    {
      key: 'email',
      label: 'E-mail',
      render: u => <span className="nx-page__muted">{u.email || '—'}</span>,
    },
    {
      key: 'createdAt',
      label: 'Registered',
      width: '190px',
      render: u => formatDate(u.createdAt),
      exportValue: u => formatDate(u.createdAt),
    },
    {
      key: 'registeredIp',
      label: 'IP Address',
      width: '160px',
      render: u => <span className="nx-page__id">{u.registeredIp || '—'}</span>,
    },
  ];

  const sessionColumns = [
    {
      key: 'username',
      label: 'Username',
      render: sn => <span className="nx-page__strong">{sn.username || '—'}</span>,
    },
    {
      key: 'ipAddress',
      label: 'Last IP Address',
      width: '180px',
      render: sn => <span className="nx-page__id">{sn.ipAddress || '—'}</span>,
    },
    {
      key: 'lastActive',
      label: 'Last Active',
      width: '190px',
      render: sn => formatDate(sn.lastActive),
      exportValue: sn => formatDate(sn.lastActive),
    },
    {
      key: 'expiry',
      label: 'Expiry',
      width: '190px',
      render: sn => formatDate(sn.expiry),
      exportValue: sn => formatDate(sn.expiry),
    },
  ];

  return (
    <Page
      title="User Admin"
      actions={
        loggedInRole !== 'Employee' && (
          <Button variant="primary" onClick={() => setIsModalOpen(true)}>Create User</Button>
        )
      }
    >
      <div className="nx-tabs" style={{ marginBottom: 'var(--nx-space-2)' }}>
        <button
          className={`nx-tabs__tab ${activeTab === 'user-table' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('user-table')}
        >
          User Table
          <span className="nx-tabs__count">{activeUsers.length}</span>
        </button>
        <button
          className={`nx-tabs__tab ${activeTab === 'awaiting' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('awaiting')}
        >
          Users Awaiting Activation
          <span className="nx-tabs__count">{pendingUsers.length}</span>
        </button>
        <button
          className={`nx-tabs__tab ${activeTab === 'sessions' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('sessions')}
        >
          Current Sessions
          <span className="nx-tabs__count">{visibleSessions.length}</span>
        </button>
      </div>

      {activeTab === 'user-table' && (
        <DataTable
          columns={activeUserColumns}
          rows={activeUsers}
          exportName="users"
          filters={['status']}
          tabsFrom="status"
          persistKey="user-admin-active"
          searchPlaceholder="Search username, status or e-mail..."
          emptyMessage="No users found"
          actions={loggedInRole !== 'Employee' ? (user => (
            <RowActions
              label={user.username || 'user'}
              onEdit={() => onEdit(user)}
            />
          )) : undefined}
        />
      )}

      {activeTab === 'awaiting' && (
        <DataTable
          columns={pendingUserColumns}
          rows={pendingUsers}
          selectable
          exportName="users-awaiting-activation"
          persistKey="user-admin-pending"
          searchPlaceholder="Search username or e-mail..."
          emptyMessage="No users awaiting activation"
          emptyHint="New sign-ups appear here until an admin activates them."
          bulkActions={(ids) => (
            // Activation is Admin-only server-side (requireAdmin), so the
            // bulk action only renders for Admins rather than answering 403.
            loggedInRole === 'Admin' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleActivateUsers(ids)}
              >
                Activate {ids.length} user{ids.length === 1 ? '' : 's'}
              </Button>
            ) : null
          )}
          /* The per-row twin of the bulk action above: activating a single
             account is the common case, and selecting its checkbox first was
             an extra step for it. Same endpoint, same Admin-only guard — the
             row simply leaves this tab once its status is no longer
             Registered/Pending. */
          actions={loggedInRole === 'Admin' ? (user => (
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleActivateUsers([user.id])}
            >
              Activate
            </Button>
          )) : undefined}
        />
      )}

      {activeTab === 'sessions' && (
        <DataTable
          columns={sessionColumns}
          rows={visibleSessions}
          exportName="current-sessions"
          filters={['username']}
          persistKey="user-admin-sessions"
          searchPlaceholder="Search username or IP..."
          emptyMessage="No current sessions found"
        />
      )}

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        size="md"
        title="Create New User"
        description="New accounts start as Registered and need activating before they can sign in."
        footer={
          <>
            <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="nx-user-form">Create User</Button>
          </>
        }
      >
        <form id="nx-user-form" onSubmit={handleSubmit}>
          <FormGrid columns={2}>
            <Field
              label="Username"
              required
              className="nx-field--full"
              hint="Minimum 5 characters"
              error={formData.username ? validateUsername(formData.username) : ''}
            >
              <Input
                name="username"
                placeholder="e.g. JohnDoe"
                value={formData.username}
                onChange={handleInputChange}
                required
                /* An admin is creating somebody else's account here, so the
                   browser must never put the admin's own username in it.
                   Matches the password field below, which already says
                   new-password for the same reason. */
                autoComplete="off"
                data-autofocus
              />
            </Field>

            <Field
              label="New Password"
              required
              hint="Min 10 characters, with a number and a special character"
              error={formData.password ? validatePassword(formData.password) : ''}
            >
              <div className="nx-password">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="new-password"
                  placeholder="Password"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                />
                <button
                  type="button"
                  className="nx-password__toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            <Field
              label="Confirm Password"
              required
              error={
                formData.confirmPassword && formData.confirmPassword !== formData.password
                  ? 'Passwords do not match.'
                  : ''
              }
            >
              <div className="nx-password">
                <Input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  autoComplete="new-password"
                  placeholder="Confirm password"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  required
                />
                <button
                  type="button"
                  className="nx-password__toggle"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            <Field
              label="E-mail"
              required
              error={formData.email ? emailError(formData.email, { label: 'E-mail' }) : ''}
            >
              <Input
                type="email"
                name="email"
                placeholder="name@company.com"
                value={formData.email}
                onChange={handleInputChange}
                onBlur={(e) => setFormData(prev => ({ ...prev, email: normalizeEmail(e.target.value) }))}
                autoComplete="off"
                spellCheck="false"
                autoCapitalize="none"
                required
              />
            </Field>

            <Field
              label="Mobile Number"
              hint="Optional — used for calls and alerts"
              error={validateNumber(formData.phone, formData.phoneCountryCode, { required: false })}
            >
              <PhoneInput
                name="phone"
                countryName="phoneCountryCode"
                value={formData.phone}
                dial={formData.phoneCountryCode}
                onChange={(v) => setFormData(prev => ({ ...prev, phone: v }))}
                onDialChange={(d) => setFormData(prev => ({ ...prev, phoneCountryCode: d }))}
              />
            </Field>

            <RecordAvatarField
              full
              value={formData.profile_image}
              onChange={(v) => setFormData(prev => ({ ...prev, profile_image: v }))}
            />
          </FormGrid>
        </form>
      </Modal>
      {/* Toast Notification */}
      {toast.visible && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
          padding: '12px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: '12px',
          background: toast.type === 'success' ? 'var(--nx-success)' : 'var(--nx-danger)',
          color: 'var(--nx-accent-contrast)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          animation: 'slideIn 0.3s ease-out'
        }}>
          <span>{toast.message}</span>
          <button
            onClick={() => setToast({ ...toast, visible: false })}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: 0 }}
          >
            &times;
          </button>
        </div>
      )}
    </Page>
  );
};

export default UserAdminList;
