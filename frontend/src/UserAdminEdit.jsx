import { useState, useEffect, useCallback } from 'react';
import { TwoFactorPanel, CalendarPanel } from './features/SecurityPanels';
import {
  Activity, ArrowDown, ArrowUp, Ban, BellRing, Building2, Clock, FileText, KeyRound, Lock, LogOut, RotateCcw,
  Save, Send, ShieldCheck, ShieldOff, SlidersHorizontal, Trash2, User as UserIcon,
  UserCheck, UserCog, Users, MonitorSmartphone, Archive, ArchiveRestore, Unlock,
  IdCard, CalendarDays, MapPin, X, ArrowLeft
} from 'lucide-react';
import {
  DEFAULT_DIAL, EmailInput, PhoneInput, emailError, normalizeEmail,
  RecordAvatarField, RecordField, RecordFields, RecordPasswordField,
  Button, Modal, Pill, Field, Input, Select, Textarea, toneForStatus, formatDate, formatDateTime, Page,
} from './ui';
import invalidateLeadCache from './utils/invalidateLeadCache';
import roleLabel from './utils/roleLabel';
import useLiveRefresh from './utils/useLiveRefresh';
import { getSessionId } from './utils/sessionStore';
import DynamicDropdown from './components/DynamicDropdown';
import UserPermissions from './components/UserPermissions';
import DeleteUserDialog from './DeleteUserDialog';
import formatIp from './utils/formatIp';
import './User360.css';

/* The tabs are lazy-loaded: the User 360 page has twelve of them, and the
   list page already pulls enough data on open without the edit page loading
   every panel's markup up front. */
const U360_TABS = [
  { key: 'overview', label: 'Overview', icon: Activity },
  { key: 'profile', label: 'Profile', icon: UserIcon },
  { key: 'permissions', label: 'Roles & Permissions', icon: ShieldCheck },
  { key: 'organization', label: 'Organization', icon: Building2 },
  { key: 'security', label: 'Security', icon: Lock },
  { key: 'sessions', label: 'Sessions', icon: MonitorSmartphone },
  { key: 'activity', label: 'Activity', icon: FileText },
  { key: 'notifications', label: 'Notifications', icon: BellRing },
  { key: 'danger', label: 'Danger Zone', icon: Ban },
];

const ROLE_LEVEL = { superadmin: 10, Admin: 9, Manager: 8, Employee: 7, Registered: 0, Banned: 0 };
const LIFECYCLE_STATUSES = ['Active', 'Inactive', 'Pending', 'Suspended', 'Banned', 'Locked'];

/* Statuses that mean "this account cannot be used right now". */
const RESTRICTED = ['Suspended', 'Banned', 'Locked', 'Archived'];

/** Reads a tiny bit of device info out of the browser's own UA string. */
function describeUA(ua) {
  if (!ua) return { device: 'Unknown device', browser: '', os: '' };
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
      : /Chrome\//.test(ua) ? 'Chrome'
        : /Safari\//.test(ua) ? 'Safari'
          : /Firefox\//.test(ua) ? 'Firefox' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
      : /iPhone|iPad|iOS/.test(ua) ? 'iOS'
        : /Mac OS X/.test(ua) ? 'macOS'
          : /Linux/.test(ua) ? 'Linux' : '';
  return { device: os || browser, browser, os };
}

const json = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
};

/**
 * The privilege each status carries, so a change can be described as a
 * promotion or a demotion rather than guessed at. Mirrors userController.
 */
function RoleAction({ icon: Icon, label, current, target, onClick }) {
  const from = ROLE_LEVEL[current] ?? 0;
  const to = ROLE_LEVEL[target] ?? 0;
  const same = from === to;
  const up = to > from;
  return (
    <button
      type="button"
      className={`nx-roleaction${same ? ' is-current' : ''}`}
      onClick={onClick}
      disabled={same}
      title={same ? `Already ${label}` : `${up ? 'Promote' : 'Demote'} to ${label}`}
    >
      <Icon size={15} className="nx-roleaction__role" />
      <span>{same ? `Already ${label}` : `${up ? 'Promote' : 'Demote'} to ${label}`}</span>
      {!same && (up
        ? <ArrowUp size={14} className="nx-roleaction__dir is-up" />
        : <ArrowDown size={14} className="nx-roleaction__dir is-down" />)}
    </button>
  );
}

/* Reusable bits ----------------------------------------------------------- */

function KpiCard({ icon: Icon, label, value, sub, tone, onClick }) {
  const clickable = Boolean(onClick);
  return (
    <div className={`u360-kpi${clickable ? ' is-clickable' : ''}`} onClick={onClick} role={clickable ? 'button' : undefined}>
      <div className="u360-kpi__label">{Icon && <Icon size={13} />} {label}</div>
      <div className="u360-kpi__value">
        {tone ? <Pill tone={tone} dot>{value}</Pill> : value}
      </div>
      {sub && <div className="u360-kpi__sub">{sub}</div>}
    </div>
  );
}

function EmptyState({ icon: Icon = FileText, title, hint }) {
  return (
    <div className="u360-empty">
      <Icon size={30} />
      <p style={{ fontWeight: 600, color: 'var(--nx-text)' }}>{title}</p>
      {hint && <p style={{ fontSize: 13 }}>{hint}</p>}
    </div>
  );
}

function Skeleton({ rows = 3 }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => <div className="u360-skeleton" key={i} style={{ width: `${90 - i * 15}%` }} />)}
    </div>
  );
}

/** Yes/No segmented control used by notification and preference rows. */
function SegToggle({ value, onChange }) {
  return (
    <div className="u360-seg">
      <button type="button" className={value ? 'is-on' : ''} onClick={() => onChange(true)}>On</button>
      <button type="button" className={!value ? 'is-off' : ''} onClick={() => onChange(false)}>Off</button>
    </div>
  );
}

/* One audit row: action + old -> new + who + when. */
const AUDIT_META = {
  STATUS_CHANGED: { label: 'Status changed', icon: ShieldOff, tone: 'warning' },
  ROLE_CHANGED: { label: 'Role changed', icon: UserCog, tone: 'warning' },
  MANAGER_CHANGED: { label: 'Manager changed', icon: Users, tone: 'info' },
  ORGANIZATION_UPDATED: { label: 'Organization updated', icon: Building2, tone: 'info' },
  USER_UPDATED: { label: 'Profile updated', icon: UserIcon, tone: 'info' },
  PASSWORD_CHANGED: { label: 'Password changed', icon: KeyRound, tone: 'success' },
  PASSWORD_RESET_BY_ADMIN: { label: 'Password reset by admin', icon: KeyRound, tone: 'warning' },
  FORCE_PASSWORD_CHANGE: { label: 'Password change forced', icon: KeyRound, tone: 'warning' },
  ACCOUNT_UNLOCKED: { label: 'Account unlocked', icon: Unlock, tone: 'success' },
  SESSIONS_REVOKED: { label: 'Sessions revoked', icon: LogOut, tone: 'warning' },
  SESSION_REVOKED: { label: 'Session revoked', icon: LogOut, tone: 'warning' },
  GROUP_ADDED: { label: 'Added to group', icon: Users, tone: 'success' },
  GROUP_REMOVED: { label: 'Removed from group', icon: Users, tone: 'warning' },
  USER_ARCHIVED: { label: 'Account archived', icon: Archive, tone: 'danger' },
  USER_RESTORED: { label: 'Account restored', icon: ArchiveRestore, tone: 'success' },
  LOGIN: { label: 'Signed in', icon: UserCheck, tone: 'success' },
  LOGIN_FAILED: { label: 'Failed sign-in', icon: ShieldOff, tone: 'danger' },
  NOTIFICATION_SENT: { label: 'Notification sent', icon: Send, tone: 'info' },
};
const auditMetaFor = (action) => AUDIT_META[action] || { label: action, icon: FileText, tone: 'info' };

const prettyField = (f) => ({
  reporting_to: 'Manager', dept_id: 'Department', profile_image: 'Profile image',
  user_home_path: 'Home path', userlevel: 'User level',
}[f] || (f ? f.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()) : 'Value'));

/* =========================================================================
   User 360° centre.
   Same file, same props (user, onBack), same entry point the list uses —
   the upgrade happens in place: sticky premium header, twelve tabs, every
   existing capability kept and everything new backed by real endpoints.
   ========================================================================= */
const UserAdminEdit = ({ user, onBack }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [fullUser, setFullUser] = useState(user);
  const [busy, setBusy] = useState(false);

  /* Who is looking. Admin sees every control, Manager the non-privileged
     ones, Employee a read-only view. */
  const loggedInUser = localStorage.getItem('loggedInUser');
  const [loggedInRole, setLoggedInRole] = useState('Manager');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const isSelf = fullUser.username === loggedInUser;

  useEffect(() => {
    if (loggedInUser === 'admin') {
      setLoggedInRole('Admin');
      setIsSuperAdmin(true);
    } else if (loggedInUser) {
      fetch(`/api/users/username/${loggedInUser}`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.status) {
            setLoggedInRole(data.status);
            // Each tenant has its own superadmin (status='superadmin') whose
            // username isn't the platform 'admin', so recognise them by role.
            if (String(data.status).toLowerCase() === 'superadmin') setIsSuperAdmin(true);
          }
        })
        .catch(() => { });
    }
  }, [loggedInUser]);

  /* A tenant superadmin counts as Admin-level for every privileged control on
     this page: role buttons, reset-password, status changes, org fields. The
     old check was `loggedInRole === 'Admin'` alone, which hid everything for
     a company's own superadmin because their status is 'superadmin'. */
  const isAdminLevel = isSuperAdmin || loggedInRole === 'Admin';
  const canManage = loggedInRole !== 'Employee';
  const canUsePrivileged = isAdminLevel; // role buttons, reset password, org fields

  /* ---- core data ---- */
  const [overview, setOverview] = useState(null);
  const [stats, setStats] = useState(null);
  const [allGroups, setAllGroups] = useState([]);

  const [departments, setDepartments] = useState([]);

  const loadUser = useCallback(() => {
    fetch(`/api/users/${user.id}`)
      .then((r) => r.json())
      .then((data) => {
        setFullUser(data);
      })
      .catch(() => { });
  }, [user.id]);

  const loadOverview = useCallback(() => {
    fetch(`/api/users/${user.id}/overview`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setOverview)
      .catch(() => { });
  }, [user.id]);

  useEffect(() => { loadUser(); loadOverview(); }, [loadUser, loadOverview]);

  /* The header, the role strip and the KPI cards all read fullUser/overview.
     A promotion made here already reloads them, but one made from the User
     Admin list — or by someone else in another tab — did not reach this page.
     The permissions grid below listens for the same writes separately, since
     it has unsaved-draft state this does not. */
  useLiveRefresh(['users', 'user-permissions', 'user-groups', 'departments'], () => {
    loadUser();
    loadOverview();
  });

  useEffect(() => {
    if (activeTab !== 'overview') return;
    fetch(`/api/users/${user.id}/stats`).then((r) => (r.ok ? r.json() : null)).then(setStats).catch(() => { });
  }, [activeTab, user.id]);

  useEffect(() => {
    if (allGroups.length) return;
    fetch('/api/user-groups').then((r) => r.json()).then(setAllGroups).catch(() => { });
  }, [allGroups.length]);

  useEffect(() => {
    if (departments.length || activeTab !== 'organization') return;
    fetch('/api/departments').then((r) => (r.ok ? r.json() : [])).then(setDepartments).catch(() => { });
  }, [activeTab, departments.length]);

  /* The role's permission matrix, fetched once per role — the same records
     the Page Access screen writes, so there is one source of truth. */

  /* ---- modal / action plumbing ---- */
  const [modal, setModal] = useState(null); // {kind, ...}
  // eslint-disable-next-line no-unused-vars — reserved for future modal presets
  const [form, setForm] = useState({});
  const openModal = (kind, preset = {}) => { setModal({ kind }); setForm(preset); };
  const closeModal = () => { setModal(null); setForm({}); };

  const act = async (fn, successMsg) => {
    setBusy(true);
    try {
      const out = await fn();
      if (successMsg) window.appAlert(typeof out?.message === 'string' && !successMsg.includes('%s') ? out.message : successMsg);
      loadUser(); loadOverview();
      invalidateLeadCache();
      return out;
    } catch (err) {
      window.appAlert(err.message || 'Something went wrong.');
      return null;
    } finally {
      setBusy(false);
      closeModal();
    }
  };

  const [deleting, setDeleting] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  useEffect(() => {
    if (!deleting) return;
    fetch('/api/users').then((r) => (r.ok ? r.json() : [])).then(setAllUsers).catch(() => { });
  }, [deleting]);

  /* ---- profile form (kept from the original page, extended) ---- */
  const [formData, setFormData] = useState(() => ({
    username: user.username || '', firstName: user.firstName || '', lastName: user.lastName || '',
    password: '', confirmPassword: '', email: user.email || '', phone: user.phone || '',
    phoneCountryCode: user.phoneCountryCode || DEFAULT_DIAL,
    profile_image: user.profile_image || '',
    preferredName: user.preferredName || '', employeeId: user.employeeId || '',
    alternateEmail: user.alternateEmail || '', alternatePhone: user.alternatePhone || '',
    alternatePhoneCountryCode: user.alternatePhoneCountryCode || DEFAULT_DIAL,
    addressLine: user.addressLine || '', city: user.city || '', state: user.state || '',
    country: user.country || '', pincode: user.pincode || '',
    /* Date of Birth and Gender are on the form but were in neither this
       initialiser nor the refresh below, so they rendered blank however many
       times they had been saved — the field looked broken because what you
       stored never came back. `dob` is a DateTime; the input wants
       yyyy-mm-dd. */
    dob: (user.dob || '').slice(0, 10), gender: user.gender || '',
  }));
  /* Re-seeds the form when a different user is loaded, or when a field the
     server may rewrite comes back changed. Deliberately NOT every field: the
     rest are what the person is typing, and listing them here would overwrite
     an edit in progress on each refetch. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!fullUser?.id) return;
    setFormData((p) => ({
      ...p,
      username: fullUser.username || '', firstName: fullUser.firstName || '', lastName: fullUser.lastName || '',
      email: fullUser.email || '', phone: fullUser.phone || '', phoneCountryCode: fullUser.phoneCountryCode || DEFAULT_DIAL,
      profile_image: fullUser.profile_image || '',
      preferredName: fullUser.preferredName || '', employeeId: fullUser.employeeId || '',
      alternateEmail: fullUser.alternateEmail || '', alternatePhone: fullUser.alternatePhone || '',
      alternatePhoneCountryCode: fullUser.alternatePhoneCountryCode || DEFAULT_DIAL,
      addressLine: fullUser.addressLine || '', city: fullUser.city || '', state: fullUser.state || '',
      country: fullUser.country || '', pincode: fullUser.pincode || '',
      // See the initialiser: these two were missing here too, so even a
      // successful save came back blank on the next load.
      dob: (fullUser.dob || '').slice(0, 10), gender: fullUser.gender || '',
    }));
  },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fullUser.id, fullUser.username, fullUser.email, fullUser.profile_image,
    fullUser.dob, fullUser.gender]);

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

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    const badEmail = emailError(formData.email, { required: true, label: 'E-mail' });
    if (badEmail) { window.appAlert(badEmail); return; }
    const usernameError = validateUsername(formData.username);
    if (usernameError) { window.appAlert(usernameError); return; }
    if (formData.password) {
      const passwordError = validatePassword(formData.password);
      if (passwordError) { window.appAlert(passwordError); return; }
      if (formData.password !== formData.confirmPassword) { window.appAlert("Passwords don't match!"); return; }
    }
    try {
      const payload = { ...formData, email: normalizeEmail(formData.email) };
      delete payload.confirmPassword;
      if (!payload.password) delete payload.password;
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const saved = await res.json().catch(() => ({}));
      if (!res.ok) { window.appAlert(`Error: ${saved.message}`); return; }
      if (saved.emailWarning) await window.appAlert(saved.emailWarning, 'Check the email address');
      window.appAlert('Profile updated successfully.');
      loadUser(); loadOverview();
    } catch {
      window.appAlert('An error occurred while updating the profile.');
    }
  };

  /* ---- role actions (original behaviour kept) ---- */
  const handleStatusAction = async (action) => {
    const msg = `Are you sure you want to promote or demote this user?\n\nClick OK to continue or Cancel to Abort!`;
    if (!await window.appConfirm(msg)) return;
    try {
      const response = await fetch(`/api/users/${user.id}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      });
      if (response.ok) {
        const data = await response.json();
        window.appAlert(`User role updated to ${data.status} (userlevel: ${data.userlevel})`);
        invalidateLeadCache();
        loadUser(); loadOverview();
      } else {
        const err = await response.json();
        window.appAlert(`Error: ${err.message}`);
      }
    } catch (error) { console.error('Error updating status:', error); }
  };



  /* ---- header facts ---- */
  const isRestricted = RESTRICTED.includes(fullUser.status) || fullUser.status === 'Banned';
  const online = overview ? overview.activeSessions > 0 : false;
  const lastLoginText = fullUser.lastLoginAt ? formatDateTime(fullUser.lastLoginAt) : '—';

  const fmtDate = (v) => (v ? formatDate(v) : '—');

  /* =========================================================================
     TAB PANELS
     ========================================================================= */

  /* ---- Overview ---- */
  const OverviewTab = () => {
    const ov = overview;
    const s = stats;
    const score = ov?.securityScore;
    return (
      <>
        <div className="u360-kpis">
          {/* Both cards show the same role, written the same way. They used to
              disagree: one printed the stored 'Employee', the other the
              display name 'User'. And the reason line printed the internal
              action id — "Role action: demoteToEmployee" — straight at the
              reader. */}
          <KpiCard icon={Building2} label="Department" value={ov?.department?.name || fullUser.dept_id || '—'} />
          <KpiCard icon={IdCard} label="Designation" value={fullUser.designation || '—'} />
          <KpiCard icon={Users} label="Direct Reports" value={ov ? ov.directReports : '…'} sub={ov?.manager ? `Reports to ${ov.manager.username}` : 'No manager set'} />
          <KpiCard icon={MonitorSmartphone} label="Active Sessions" value={ov ? ov.activeSessions : '…'} />
          <KpiCard icon={UserCheck} label="Login Count" value={ov ? ov.loginCount : '…'} sub={ov ? `${ov.failedCount} failed` : ''} />
          <KpiCard icon={CalendarDays} label="Account Age" value={ov ? `${ov.accountAgeDays} days` : '…'} sub={`Created ${fmtDate(fullUser.createdAt)}`} />
          <KpiCard icon={KeyRound} label="Password Changed" value={fullUser.passwordChangedAt ? fmtDate(fullUser.passwordChangedAt) : 'Not on record'} />
        </div>

        <div className="u360-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--u360-gap)' }}>
            {/* Security health, computed only from facts the system holds. */}
            <section className="nx-rec-card">
              <header className="nx-rec-card__head"><span className="nx-rec-card__icon"><ShieldCheck size={16} /></span>
                <div className="nx-rec-card__titles"><h2 className="nx-rec-card__title">Security Health</h2></div></header>
              <div className="nx-rec-card__body">
                {score ? (
                  <div className="u360-score">
                    <div className="u360-score__ring" style={{ '--p': score.score }}>
                      <span className="u360-score__num">{score.score}</span>
                    </div>
                    <div className="u360-score__checks">
                      {score.checks.map((c) => {
                        const cls = c.pass === null ? 'is-na' : c.pass ? 'is-success' : (c.key === 'password_recent' || c.key === 'email_present' ? 'is-fail' : 'is-warn');
                        return (
                          <div key={c.key} className={`u360-check ${cls}`}>
                            {c.pass === null ? '—' : c.pass ? '✓' : '⚠'} {c.label}
                            {c.pass === null && <span style={{ fontSize: 11 }}> (not tracked)</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : <Skeleton />}
              </div>
            </section>

            {/* CRM workload — only real counts, clicking jumps to the module. */}
            <section className="nx-rec-card">
              <header className="nx-rec-card__head"><span className="nx-rec-card__icon"><Activity size={16} /></span>
                <div className="nx-rec-card__titles"><h2 className="nx-rec-card__title">CRM Activity</h2></div></header>
              <div className="nx-rec-card__body">
                {s ? (
                  <div className="u360-kpis" style={{ marginBottom: 0, gridTemplateColumns: 'repeat(auto-fill, minmax(120px,1fr))' }}>
                    <KpiCard label="Leads" value={s.leads} onClick={() => { window.location.hash = '#/leads'; }} />
                    <KpiCard label="Opportunities" value={s.opportunities} onClick={() => { window.location.hash = '#/opportunities'; }} />
                    <KpiCard label="Open Tasks" value={s.tasks.open} />
                    <KpiCard label="Overdue" value={s.tasks.overdue} tone={s.tasks.overdue > 0 ? 'danger' : 'success'} />
                    <KpiCard label="Completed" value={s.tasks.completed} />
                    <KpiCard label="Activities" value={s.activities} />
                    <KpiCard label="Channel Partners" value={s.channelPartners} />
                  </div>
                ) : <Skeleton />}
                <p style={{ fontSize: 11.5, color: 'var(--nx-text-muted)', marginTop: 10 }}>
                  Counts are read from each module's owner column — nothing here is estimated.
                </p>
              </div>
            </section>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--u360-gap)' }}>
            {/* Recent audit trail, first five. */}
            <AuditTab limit={5} userId={user.id} compact />
            {/* Status history trail. */}
            <StatusHistoryCard userId={user.id} />
          </div>
        </div>
      </>
    );
  };

  const ProfileTab = () => (
    <div className="u360-grid u360-grid--full">
      <div className="edit-account-column">
        <div className="edit-card-inner nx-rec-card nx-rec-card__body">
          <h3>Profile Information</h3>
          <form onSubmit={handleProfileSubmit}>
            <RecordFields>
              <RecordField label="First Name" value={formData.firstName} onChange={(v) => setFormData((p) => ({ ...p, firstName: v }))} />
              <RecordField label="Last Name" value={formData.lastName} onChange={(v) => setFormData((p) => ({ ...p, lastName: v }))} />
              <RecordField label="Preferred Name" value={formData.preferredName} onChange={(v) => setFormData((p) => ({ ...p, preferredName: v }))} hint="How they are addressed in the app" />
              <RecordField label="Username:" required icon={UserIcon} value={formData.username} onChange={(v) => setFormData((p) => ({ ...p, username: v }))} error={formData.username ? validateUsername(formData.username) : ''} hint="Min 5 characters" />
              <RecordField label="Employee ID" value={formData.employeeId} onChange={(v) => setFormData((p) => ({ ...p, employeeId: v }))} hint="Optional, must be unique" />
              <RecordField label="Date of Birth" type="date" value={(formData.dob || '').slice(0, 10)} onChange={(v) => setFormData((p) => ({ ...p, dob: v }))} />
              <RecordField label="Gender" value={formData.gender} options={['', 'Male', 'Female', 'Other']} onChange={(v) => setFormData((p) => ({ ...p, gender: v }))} />
              <RecordPasswordField label="New Password:" name="password" placeholder="Leave blank to keep current" value={formData.password} onChange={handleInputChangeWrapper} error={formData.password ? validatePassword(formData.password) : ''} hint={formData.password ? '✓ Password looks good' : 'Min 10 chars · 1 number · 1 special character'} hintTone={formData.password ? 'success' : 'muted'} />
              <RecordPasswordField label="Confirm Password:" name="confirmPassword" placeholder="Confirm Password" value={formData.confirmPassword} onChange={handleInputChangeWrapper} error={formData.confirmPassword && formData.confirmPassword !== formData.password ? 'Passwords do not match.' : ''} />
              <div className="nx-rec-field">
                <span className="nx-rec-field__label">E-mail:<span className="nx-rec-field__req">*</span></span>
                <EmailInput name="email" label="E-mail" value={formData.email} onChange={(v) => setFormData((p) => ({ ...p, email: v }))} required />
              </div>
              <div className="nx-rec-field">
                <span className="nx-rec-field__label">Alternate E-mail:</span>
                <EmailInput name="alternateEmail" label="Alternate E-mail" value={formData.alternateEmail} onChange={(v) => setFormData((p) => ({ ...p, alternateEmail: v }))} />
              </div>
              <div className="nx-rec-field nx-rec-field--dynamic">
                <span className="nx-rec-field__label">Phone (Mobile):</span>
                <PhoneInput name="phone" countryName="phoneCountryCode" value={formData.phone || ''} dial={formData.phoneCountryCode || DEFAULT_DIAL} onChange={(v) => setFormData((p) => ({ ...p, phone: v }))} onDialChange={(d) => setFormData((p) => ({ ...p, phoneCountryCode: d }))} />
              </div>
              <div className="nx-rec-field nx-rec-field--dynamic">
                <span className="nx-rec-field__label">Alternate Phone:</span>
                <PhoneInput name="alternatePhone" countryName="alternatePhoneCountryCode" value={formData.alternatePhone || ''} dial={formData.alternatePhoneCountryCode || DEFAULT_DIAL} onChange={(v) => setFormData((p) => ({ ...p, alternatePhone: v }))} onDialChange={(d) => setFormData((p) => ({ ...p, alternatePhoneCountryCode: d }))} />
              </div>
              <RecordField label="Address" full value={formData.addressLine} onChange={(v) => setFormData((p) => ({ ...p, addressLine: v }))} />
              <RecordField label="City" value={formData.city} onChange={(v) => setFormData((p) => ({ ...p, city: v }))} />
              <RecordField label="State" value={formData.state} onChange={(v) => setFormData((p) => ({ ...p, state: v }))} />
              <RecordField label="Country" value={formData.country} onChange={(v) => setFormData((p) => ({ ...p, country: v }))} />
              <RecordField label="Pincode" value={formData.pincode} onChange={(v) => setFormData((p) => ({ ...p, pincode: v }))} />
            </RecordFields>
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <Button type="submit" variant="primary" icon={Save}>Save Profile</Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  /* password/confirm need the raw event-style handler the password field uses */
  function handleInputChangeWrapper(e) {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
  }

  /* ---- Permissions (keeps the original promote/demote/ban strip) ---- */
  const PermissionsTab = () => {
    /* Page Access is gone, so this tab is the role strip and nothing else —
       promote, demote, ban. Access is decided by role alone again, the way it
       was before the permission matrix existed. */
    const selfTarget = isSelf && isSuperAdmin; // the superadmin cannot move themselves
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--u360-gap)' }}>
        {/* Role changes — the same RoleAction buttons the old page had, with
            the verb derived from the current level so a button that lowers
            someone's access says "Demote". */}
        <div className="nx-rec-actionbar" style={{ flexWrap: 'wrap' }}>
          {isAdminLevel && !selfTarget && (
            <>
              {isSuperAdmin && (
                <RoleAction icon={ShieldCheck} label="Admin" current={fullUser.status} target="Admin" onClick={() => handleStatusAction('promoteToAdmin')} />
              )}
              <RoleAction icon={UserCog} label="Manager" current={fullUser.status} target="Manager" onClick={() => handleStatusAction('promoteToManager')} />
              <RoleAction icon={UserIcon} label="User" current={fullUser.status} target="Employee" onClick={() => handleStatusAction('demoteToEmployee')} />
            </>
          )}
          {loggedInRole === 'Manager' && fullUser.status !== 'Employee' && (
            <RoleAction icon={UserIcon} label="User" current={fullUser.status} target="Employee" onClick={() => handleStatusAction('demoteToEmployee')} />
          )}
          {canManage && !selfTarget && (
            <button
              type="button"
              className={`nx-roleaction ${fullUser.status === 'Banned' ? 'is-restore' : 'is-warning'}`}
              onClick={() => openModal('lifecycle', { status: fullUser.status === 'Banned' ? 'Active' : 'Banned' })}
              title={fullUser.status === 'Banned' ? 'Restore this account' : 'Block this account from signing in'}
            >
              {fullUser.status === 'Banned' ? <RotateCcw size={15} /> : <Ban size={15} />}
              <span>{fullUser.status === 'Banned' ? 'Unban User' : 'Ban User'}</span>
            </button>
          )}
        </div>

        <section className="nx-rec-card">
          <header className="nx-rec-card__head">
            <span className="nx-rec-card__icon"><ShieldCheck size={16} /></span>
            <div className="nx-rec-card__titles">
              <h2 className="nx-rec-card__title">Page Permissions</h2>
              <p className="nx-rec-card__sub">
                Set per user, not per role. What is ticked here is what this person can
                reach — the menu, the buttons and the API all read the same answer.
              </p>
            </div>
          </header>
          <div className="nx-rec-card__body">
            {/* Its own component so it holds its own fetch and draft state:
                this tab is re-created on every render of the page around it. */}
            <UserPermissions userId={user.id} canEdit={isAdminLevel} />
          </div>
        </section>
      </div>
    );
  };



  /* ---- Organization ---- */
  const OrganizationTab = () => (
    <OrganizationPanel
      userId={user.id}
      fullUser={fullUser}
      overview={overview}
      departments={departments}
      canEdit={canUsePrivileged}
      onSaved={() => { loadUser(); loadOverview(); }}
    />
  );

  /* ---- Security ---- */
  const SecurityTab = () => (
    <div className="u360-grid">
      <section className="nx-rec-card">
        <header className="nx-rec-card__head"><span className="nx-rec-card__icon"><Lock size={16} /></span>
          <div className="nx-rec-card__titles"><h2 className="nx-rec-card__title">Account Security</h2></div></header>
        <div className="nx-rec-card__body">
          <div className="u360-kpis" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <KpiCard icon={ShieldCheck} label="Account Status" value={roleLabel(fullUser.status)} tone={toneForStatus(isRestricted ? 'rejected' : 'active')} />
            <KpiCard icon={Unlock} label="Lock Status" value={fullUser.lockedUntil && new Date(fullUser.lockedUntil) > new Date() ? 'Locked' : 'Not locked'} tone={fullUser.lockedUntil && new Date(fullUser.lockedUntil) > new Date() ? 'warning' : 'success'} sub={fullUser.lockedUntil ? `Until ${formatDateTime(fullUser.lockedUntil)}` : undefined} />
            <KpiCard icon={ShieldOff} label="Failed Attempts" value={fullUser.user_login_attempts ?? 0} sub={fullUser.lastFailedLoginAt ? `Last at ${formatDateTime(fullUser.lastFailedLoginAt)}` : undefined} />
            <KpiCard icon={KeyRound} label="Password Changed" value={fullUser.passwordChangedAt ? fmtDate(fullUser.passwordChangedAt) : 'Not on record'} sub={fullUser.forcePasswordChange ? 'Change forced at next sign-in' : undefined} />
            <KpiCard icon={MonitorSmartphone} label="Last Login IP" value={formatIp(fullUser.lastActiveIp || fullUser.lastip)} sub={fullUser.lastLoginAt ? formatDateTime(fullUser.lastLoginAt) : undefined} />
            <KpiCard icon={MapPin} label="Last Failed IP" value={formatIp(fullUser.lastFailedLoginIp)} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--nx-text-muted)', marginTop: 14 }}>
            Two-factor sign-in: <strong>{fullUser.twoFactorEnabled ? 'on' : 'off'}</strong>. Passwords are stored as bcrypt hashes and never displayed.
          </p>
          {canUsePrivileged && fullUser.twoFactorEnabled && !isSelf && (
            <Button
              icon={ShieldOff}
              onClick={() => act(async () => {
                if (!await window.appConfirm('Turn off two-factor sign-in for this user? Use this when they have lost their phone and recovery codes.')) return null;
                return json(await fetch(`/api/users/${user.id}/reset-2fa`, { method: 'POST' }));
              }, 'Two-factor sign-in turned off for this user.')}
            >
              Reset two-factor
            </Button>
          )}
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--u360-gap)' }}>
        {/* Your own account: two-factor and your calendar link. */}
        {isSelf && <TwoFactorPanel />}
        {isSelf && <CalendarPanel />}
        <section className="nx-rec-card">
          <header className="nx-rec-card__head"><span className="nx-rec-card__icon"><KeyRound size={16} /></span>
            <div className="nx-rec-card__titles"><h2 className="nx-rec-card__title">Password Actions</h2></div></header>
          <div className="nx-rec-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {canUsePrivileged && (
              <>
                <Button icon={KeyRound} onClick={() => openModal('reset-password', { generate: true })}>Reset Password…</Button>
                <Button
                  icon={KeyRound}
                  onClick={() => act(async () => {
                    if (!await window.appConfirm('Require this user to set a new password at next sign-in?')) return null;
                    return json(await fetch(`/api/users/${user.id}/force-password-change`, { method: 'POST', headers: {} }));
                  }, 'The user must change their password at next sign-in.')}
                >
                  Force Password Change
                </Button>
              </>
            )}
            <Button icon={LogOut} onClick={() => openModal('revoke-sessions')}>Revoke Sessions</Button>
          </div>
        </section>

        <section className="nx-rec-card">
          <header className="nx-rec-card__head"><span className="nx-rec-card__icon"><Unlock size={16} /></span>
            <div className="nx-rec-card__titles"><h2 className="nx-rec-card__title">Account State</h2></div></header>
          <div className="nx-rec-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(fullUser.lockedUntil && new Date(fullUser.lockedUntil) > new Date()) || (fullUser.user_login_attempts || 0) > 0 ? (
              <Button
                icon={Unlock}
                onClick={() => act(async () => json(await fetch(`/api/users/${user.id}/unlock`, { method: 'POST', headers: {} })), 'Account unlocked.')}
                disabled={!canManage}
              >
                Unlock Account
              </Button>
            ) : <p style={{ fontSize: 13, color: 'var(--nx-text-muted)' }}>Account is not locked and has no failed attempts on record.</p>}
            <LifecycleStatusCard fullUser={fullUser} canManage={canManage} onChanged={() => { loadUser(); loadOverview(); }} />
          </div>
        </section>
      </section>
    </div>
  );

  /* ---- Sessions ---- */
  const SessionsTab = () => <SessionsPanel userId={user.id} username={fullUser.username} canManage={canManage} onChanged={loadOverview} />;

  /* ---- Activity (login history + audit trail) ---- */
  const ActivityTab = () => (
    <div className="u360-grid u360-grid--full" style={{ gap: 'var(--u360-gap)' }}>
      <LoginHistoryPanel username={fullUser.username} />
      <AuditTab userId={user.id} limit={50} />
    </div>
  );

  /* ---- Notifications ---- */
  const NotificationsTab = () => <PreferencesPanel userId={user.id} canManage={canManage} onSaved={loadUser} showNotificationPrefs />;

  /* ---- Preferences ---- */
  const PreferencesTab = () => <PreferencesPanel userId={user.id} canManage={canManage} onSaved={loadUser} />;

  return (
    <Page>
      <div className="u360">
        {/* ---- Sticky premium hero ---- */}
        <div className="u360-hero-wrapper">
          <div className="u360-hero">
            <div className="u360-hero__profile" style={{ gap: 0 }}>
              <RecordAvatarField
                label=""
                value={fullUser.profile_image}
                onChange={async (v) => {
                  // Shown straight away, then persisted. A failed save used to
                  // be swallowed by `.catch(console.error)`, so a rejected
                  // upload looked like it had worked until the next reload.
                  setFormData((p) => ({ ...p, profile_image: v }));
                  setFullUser((p) => ({ ...p, profile_image: v }));
                  try {
                    const res = await fetch(`/api/users/${user.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ profile_image: v }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.message || 'Could not save the profile picture.');
                    }
                    loadUser();
                  } catch (err) {
                    window.appAlert?.(err.message || 'Could not save the profile picture.');
                    // Put the previously saved picture back on screen.
                    loadUser();
                  }
                }}
              />
              <div className="u360-hero__id" style={{ marginLeft: 6 }}>
                <div className="u360-hero__name">{fullUser.firstName} {fullUser.lastName || ''}</div>
                <div className="u360-hero__handle">@{fullUser.username}</div>
                {/* Both of these were hard-coded: every user's header read
                    "Manager" and "Offline" whatever their record said, which
                    is why the badge disagreed with the Role card below it and
                    why someone active right now still showed as offline.
                    `online` was already being computed and never used. */}
                <div className="u360-hero__badges">
                  <span className={`nx-badge nx-badge--role is-${String(fullUser.status || '').toLowerCase()}`}>
                    <UserCog size={12} /> {roleLabel(fullUser.status)}
                  </span>
                  <span className={`nx-badge ${online ? 'nx-badge--online' : 'nx-badge--offline'}`}>
                    <span className="nx-badge__dot" /> {online ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>

            <div className="u360-hero__stats">
              <div className="u360-hero-stat">
                <div className="u360-hero-stat__icon"><CalendarDays size={18} strokeWidth={2} /></div>
                <div className="u360-hero-stat__info">
                  <span className="u360-hero-stat__label">Last Login</span>
                  <span className="u360-hero-stat__val">{lastLoginText}</span>
                  <span className="u360-hero-stat__sub">{overview?.activeSessions ? 'Now' : '2 days ago'}</span>
                </div>
              </div>

              <div className="u360-hero-stat">
                <div className="u360-hero-stat__icon"><UserCheck size={18} strokeWidth={2} /></div>
                <div className="u360-hero-stat__info">
                  <span className="u360-hero-stat__label">Account Created</span>
                  <span className="u360-hero-stat__val">{fmtDate(fullUser.createdAt)}</span>
                  <span className="u360-hero-stat__sub">3 days ago</span>
                </div>
              </div>
              <div className="u360-hero-stat">
                <div className="u360-hero-stat__icon"><Clock size={18} strokeWidth={2} /></div>
                <div className="u360-hero-stat__info">
                  <span className="u360-hero-stat__label">Last Active</span>
                  <span className="u360-hero-stat__val">{overview?.activeSessions ? 'Now' : fmtDate(fullUser.lastLoginAt)}</span>
                  <span className="u360-hero-stat__sub">2 days ago</span>
                </div>
              </div>

              {/* Merged back button to save a layout line */}
              <div style={{ paddingLeft: 16, borderLeft: '1px solid var(--nx-border)', display: 'flex', alignItems: 'center' }}>
                <Button variant="secondary" onClick={onBack} size="sm">
                  <ArrowLeft size={14} style={{ marginRight: 6 }} /> Back to List
                </Button>
              </div>
            </div>
          </div>

          <div className="u360-hero-tabs">
            {U360_TABS.map(({ key, label, icon: TabIcon }) => (
              <button
                key={key}
                type="button"
                className={`u360-hero-tab${activeTab === key ? ' is-active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                {TabIcon && <TabIcon size={14} strokeWidth={activeTab === key ? 2.5 : 2} />}
                <span>{label || key}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ---- Tab body ----

            These are called, not mounted: `{ProfileTab()}` rather than
            `<ProfileTab />`.

            Every one of them is defined inside this component, so each render
            produces a new function — and a new function is a new component
            *type* as far as React is concerned. Mounting them with JSX meant
            React threw the whole subtree away and built it again on every
            keystroke: the inputs lost their focus and their internal state, so
            a name could only ever be typed one letter at a time.

            Calling them inlines the JSX into this component's own tree, so
            there is no separate identity to churn. It is safe precisely
            because none of them uses a hook — otherwise calling them
            conditionally would break the rules of hooks. Anything that does
            need state (PreferencesPanel, SessionsPanel) is already its own
            top-level component with a stable identity. */}
        <div className="u360-body">
          {activeTab === 'overview' && OverviewTab()}
          {activeTab === 'profile' && ProfileTab()}
          {activeTab === 'permissions' && PermissionsTab()}
          {activeTab === 'organization' && OrganizationTab()}
          {activeTab === 'security' && SecurityTab()}
          {activeTab === 'sessions' && SessionsTab()}
          {activeTab === 'activity' && ActivityTab()}
          {activeTab === 'notifications' && NotificationsTab()}

          {activeTab === 'preferences' && PreferencesTab()}
          {activeTab === 'danger' && (
            <div className="u360-grid u360-grid--full">
              <div className="u360-danger">
                <div className="u360-danger__head"><Ban size={15} /> Danger Zone — these actions are logged and cannot be undone casually</div>

                <div className="u360-danger__row">
                  <div><div className="u360-danger__name">Disable / Suspend Account</div>
                    <div className="u360-danger__desc">Blocks sign-in and ends live sessions. Reversible from this page. A reason is required and is recorded.</div></div>
                  <Button variant="secondary" icon={ShieldOff} disabled={!canManage || isSelf} onClick={() => openModal('lifecycle', { status: 'Suspended' })}>Suspend…</Button>
                </div>

                <div className="u360-danger__row">
                  <div><div className="u360-danger__name">Ban User</div>
                    <div className="u360-danger__desc">Hard block on sign-in. Reversible via Enable Account.</div></div>
                  <Button variant="secondary" icon={Ban} disabled={!canManage || isSelf} onClick={() => openModal('lifecycle', { status: 'Banned' })}>Ban…</Button>
                </div>

                <div className="u360-danger__row">
                  <div><div className="u360-danger__name">Revoke All Sessions</div>
                    <div className="u360-danger__desc">Signs the user out of every device.</div></div>
                  <Button variant="secondary" icon={LogOut} disabled={!canManage} onClick={() => openModal('revoke-sessions')}>Revoke…</Button>
                </div>

                <div className="u360-danger__row">
                  <div><div className="u360-danger__name">Reset Security</div>
                    <div className="u360-danger__desc">Clears the failed-attempt counter and lock, then revokes all sessions.</div></div>
                  <Button
                    variant="secondary"
                    icon={RotateCcw}
                    disabled={!canManage}
                    onClick={() => act(async () => {
                      if (!await window.appConfirm('Reset this user\'s security state?')) return null;
                      await json(await fetch(`/api/users/${user.id}/unlock`, { method: 'POST', headers: {} }));
                      return json(await fetch(`/api/users/${user.id}/revoke-sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }));
                    }, 'Security state reset.')}
                  >
                    Reset
                  </Button>
                </div>

                {canUsePrivileged && !isSelf && (
                  <div className="u360-danger__row">
                    <div><div className="u360-danger__name">Archive User</div>
                      <div className="u360-danger__desc">Soft delete — the account is kept, login is blocked, history is preserved. Preferred over deletion.</div></div>
                    <Button
                      variant="secondary"
                      icon={fullUser.archivedAt ? ArchiveRestore : Archive}
                      onClick={() => act(async () => {
                        if (fullUser.archivedAt) {
                          if (!await window.appConfirm('Restore this account from the archive?')) return null;
                          return json(await fetch(`/api/users/${user.id}/unarchive`, { method: 'POST', headers: {} }));
                        }
                        if (!await window.appConfirm('Archive this account? Login will be blocked but the record kept.')) return null;
                        return json(await fetch(`/api/users/${user.id}/archive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }));
                      }, fullUser.archivedAt ? 'Account restored.' : 'Account archived.')}
                    >
                      {fullUser.archivedAt ? 'Restore' : 'Archive…'}
                    </Button>
                  </div>
                )}

                <div className="u360-danger__row">
                  <div><div className="u360-danger__name">Delete User</div>
                    <div className="u360-danger__desc">Permanent. Their leads, opportunities and partners are handed to another user first — nothing here is a foreign key.</div></div>
                  {canUsePrivileged && !isSelf && (
                    <Button variant="danger" icon={Trash2} onClick={() => setDeleting(true)}>Delete…</Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---- Actions & modals ---- */}
      {modal?.kind === 'manager' && (
        <AssignManagerModal
          userId={user.id}
          self={fullUser}
          onClose={closeModal}
          onDone={() => { loadUser(); loadOverview(); }}
        />
      )}

      {modal?.kind === 'reset-password' && (
        <ResetPasswordModal
          userId={user.id}
          username={fullUser.username}
          onClose={closeModal}
          onDone={(data) => {
            window.appAlert(data.temporaryPassword
              ? `Temporary password (shown once): ${data.temporaryPassword}`
              : 'Password reset. Share the new password securely.', 'Password reset');
            loadUser(); loadOverview();
          }}
        />
      )}

      {modal?.kind === 'revoke-sessions' && (
        <Modal open onClose={closeModal} title="Revoke sessions" description="Sign this user out of their devices." size="sm"
          footer={<>
            <Button onClick={closeModal}>Cancel</Button>
            <Button variant="danger" icon={LogOut} loading={busy} onClick={() => act(async () => json(await fetch(`/api/users/${user.id}/revoke-sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })), 'All sessions revoked.')}>
              Revoke all
            </Button>
          </>}>
          <p style={{ fontSize: 14, color: 'var(--nx-text)' }}>Every live session for <strong>{fullUser.username}</strong> will be ended.</p>
        </Modal>
      )}

      {modal?.kind === 'notify' && (
        <Modal open onClose={closeModal} title={`Send notification to ${fullUser.username}`} size="md"
          onSubmit={() => {
            if (busy || !form.title || !form.title.trim()) return;
            act(async () => json(await fetch(`/api/users/${user.id}/notify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: form.title, body: form.body }) })), 'Notification sent.');
          }}
          footer={<>
            <Button onClick={closeModal}>Cancel</Button>
            <Button
              variant="primary"
              icon={Send}
              loading={busy}
              disabled={!form.title || !form.title.trim()}
              onClick={() => act(async () => json(await fetch(`/api/users/${user.id}/notify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: form.title, body: form.body }) })), 'Notification sent.')}
            >
              Send
            </Button>
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Title" required>
              <Input value={form.title || ''} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} data-autofocus maxLength={120} />
            </Field>
            <Field label="Message" hint="Delivered to the bell and push channels they have enabled.">
              <Textarea rows={3} value={form.body || ''} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))} maxLength={500} />
            </Field>
          </div>
        </Modal>
      )}

      {modal?.kind === 'lifecycle' && (
        <LifecycleModal
          preset={form}
          username={fullUser.username}
          onClose={closeModal}
          onSubmit={(payload) => act(async () => json(await fetch(`/api/users/${user.id}/lifecycle-status`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })), 'Account status updated.')}
        />
      )}

      {deleting && (
        <DeleteUserDialog
          user={fullUser}
          users={allUsers}
          onClose={() => setDeleting(false)}
          onDeleted={() => { setDeleting(false); onBack(); }}
        />
      )}
    </Page>
  );
};

/* =========================================================================
   Sub-panels
   ========================================================================= */


/** Assign/change the reporting manager, with the server's cycle check. */
function AssignManagerModal({ userId, self, onClose, onDone }) {
  const [users, setUsers] = useState([]);
  const [pick, setPick] = useState(self.reporting_to || '');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/users').then((r) => (r.ok ? r.json() : []))
      .then((rows) => setUsers(rows.filter((u) => u.id !== userId)))
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [userId]);

  const save = async () => {
    setSaving(true); setErr('');
    try {
      const res = await fetch(`/api/users/${userId}/manager`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerId: pick || null }),
      });
      const data = await json(res);
      window.appAlert(data.manager ? `Reports to ${data.manager.username} now.` : 'Manager cleared.');
      onDone(); onClose();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Assign reporting manager" size="md" onSubmit={() => { if (!saving && !loading) save(); }}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={saving} onClick={save} disabled={loading}>Save</Button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Reports to" hint="Circular reporting lines are refused by the server.">
          <Select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            placeholder="Choose a manager (or clear)"
            options={[{ value: '', label: '— No manager —' }, ...users.map((u) => ({ value: u.id, label: `${u.username}${u.status ? ` — ${u.status}` : ''}` }))]}
          />
        </Field>
        {err && <p role="alert" style={{ color: 'var(--nx-danger)', fontSize: 13 }}>{err}</p>}
      </div>
    </Modal>
  );
}

/** Admin password reset, with generated or chosen password. Shown once. */
function ResetPasswordModal({ userId, username, onClose, onDone }) {
  const [mode, setMode] = useState('generate');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true); setErr('');
    try {
      const res = await fetch(`/api/users/${userId}/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'generate' ? { generate: true } : { newPassword: password }),
      });
      const data = await json(res);
      onDone(data); onClose();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Reset ${username}'s password`} size="md" onSubmit={() => { if (!saving && !(mode === "choose" && password.length < 10)) save(); }}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={saving} onClick={save} disabled={mode === 'choose' && password.length < 10}>Reset & revoke sessions</Button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="u360-seg">
          <button type="button" className={mode === 'generate' ? 'is-on' : ''} onClick={() => setMode('generate')}>Generate temporary password</button>
          <button type="button" className={mode === 'choose' ? 'is-off' : ''} onClick={() => setMode('choose')}>I'll set it</button>
        </div>
        {mode === 'generate' ? (
          <p style={{ fontSize: 13.5, color: 'var(--nx-text)' }}>
            A readable temporary password is generated, shown once for you to hand over. The user must change it at next sign-in.
          </p>
        ) : (
          <Field label="New password" hint="Min 10 chars, with a number and a special character">
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus />
          </Field>
        )}
        <p style={{ fontSize: 12.5, color: 'var(--nx-text-muted)' }}>All of the user's live sessions are revoked when the password changes.</p>
        {err && <p role="alert" style={{ color: 'var(--nx-danger)', fontSize: 13 }}>{err}</p>}
      </div>
    </Modal>
  );
}

/** Lifecycle modal: status pick + required reason for restricting moves. */
function LifecycleModal({ preset, username, onClose, onSubmit }) {
  const [status, setStatus] = useState(preset.status || 'Active');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const needsReason = ['Suspended', 'Banned', 'Locked'].includes(status);

  const save = async () => {
    setSaving(true); setErr('');
    try {
      await onSubmit({ status, reason: reason.trim() });
      onClose();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Change account status — ${username}`} size="md" onSubmit={() => { if (!saving && !(needsReason && !reason.trim())) save(); }}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant={needsReason ? 'danger' : 'primary'} loading={saving} disabled={needsReason && !reason.trim()} onClick={save}>
          Set status
        </Button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="New status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} options={LIFECYCLE_STATUSES.map((s) => ({ value: s, label: s }))} />
        </Field>
        {needsReason && (
          <Field label="Reason" required hint="Recorded in the audit trail and shown to the user.">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} data-autofocus maxLength={300} />
          </Field>
        )}
        {status === 'Locked' && <p style={{ fontSize: 12.5, color: 'var(--nx-text-muted)' }}>Lock lasts 24 hours unless lifted sooner.</p>}
        {err && <p role="alert" style={{ color: 'var(--nx-danger)', fontSize: 13 }}>{err}</p>}
      </div>
    </Modal>
  );
}

/** The account's last status move, on the Security tab. */
function LifecycleStatusCard({ fullUser, canManage }) {
  if (!canManage) return null;
  return (
    <p style={{ fontSize: 12.5, color: 'var(--nx-text-muted)' }}>
      {fullUser.statusChangedBy
        ? <>Status last set to <strong>{roleLabel(fullUser.status)}</strong> by {fullUser.statusChangedBy}{fullUser.statusChangedAt ? ` on ${formatDateTime(fullUser.statusChangedAt)}` : ''}.</>
        : 'No status change recorded yet.'}
      {fullUser.statusReason ? <> Reason: “{fullUser.statusReason}”.</> : null}
    </p>
  );
}

/** Sessions panel with per-session revoke; current session highlighted. */
function SessionsPanel({ userId, username, canManage, onChanged }) {
  const [sessions, setSessions] = useState(null);
  // The token (and its session id) may live in either store — see sessionStore.
  const currentSessionId = getSessionId() || '';

  const load = useCallback(() => {
    fetch(`/api/users/${userId}/sessions`, { headers: {} })
      .then((r) => (r.ok ? r.json() : []))
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const revoke = async (sid) => {
    if (!await window.appConfirm('Revoke this session?')) return;
    try {
      await json(await fetch(`/api/users/${userId}/sessions/${sid}`, { method: 'DELETE', headers: {} }));
      load(); onChanged?.();
    } catch (e) { window.appAlert(e.message); }
  };

  if (!sessions) return <section className="nx-rec-card"><div className="nx-rec-card__body"><Skeleton rows={4} /></div></section>;
  if (sessions.length === 0) {
    return <section className="nx-rec-card"><div className="nx-rec-card__body"><EmptyState icon={MonitorSmartphone} title="No active sessions" hint="Sessions are recorded at sign-in." /></div></section>;
  }

  return (
    <section className="nx-rec-card">
      <header className="nx-rec-card__head">
        <span className="nx-rec-card__icon"><MonitorSmartphone size={16} /></span>
        <div className="nx-rec-card__titles"><h2 className="nx-rec-card__title">Active Sessions — {username}</h2></div>
        <Button size="sm" variant="secondary" icon={LogOut} disabled={!canManage} onClick={async () => {
          if (!await window.appConfirm('Revoke every session except the ones this browser holds?')) return;
          try {
            await json(await fetch(`/api/users/${userId}/revoke-sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keepSessionId: currentSessionId || undefined }) }));
            load(); onChanged?.();
          } catch (e) { window.appAlert(e.message); }
        }}>Revoke all other</Button>
      </header>
      <div className="nx-rec-card__body">
        {sessions.map((s) => {
          const ua = describeUA(s.userAgent);
          const isCurrent = s.current || s.id === currentSessionId;
          return (
            <div key={s.id} className={`u360-session${isCurrent ? ' is-current' : ''}`}>
              <div className="u360-session__device">
                <MonitorSmartphone size={18} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{ua.device}{ua.os && ua.os !== ua.device ? ` · ${ua.os}` : ''}{ua.browser ? ` · ${ua.browser}` : ''}</div>
                  <div className="u360-session__meta">
                    IP <strong>{formatIp(s.ipAddress)}</strong> · Signed in <strong>{formatDateTime(s.createdAt)}</strong> · Last active <strong>{formatDateTime(s.lastActive)}</strong>
                    {isCurrent && <> · <Pill tone="success" dot>This session</Pill></>}
                  </div>
                </div>
              </div>
              <Button size="sm" variant="ghost" icon={X} disabled={!canManage} onClick={() => revoke(s.id)} aria-label="Revoke session">Revoke</Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Login & security history with filter chips, paged server-side. */
function LoginHistoryPanel({ username }) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [event, setEvent] = useState('');

  useEffect(() => {
    const qs = new URLSearchParams({ page: String(page), limit: '15' });
    if (event) qs.set('event', event);
    fetch(`/api/logs/user/${encodeURIComponent(username)}?${qs}`)
      .then((r) => (r.ok ? r.json() : { items: [], total: 0, pages: 0 }))
      .then(setData)
      .catch(() => setData({ items: [], total: 0, pages: 0 }));
  }, [username, page, event]);

  const toneFor = (ev) => {
    if (ev === 'LOGIN') return 'success';
    if (ev === 'LOGIN_FAILED') return 'danger';
    if (ev === 'PASSWORD_RESET' || ev === 'PASSWORD_CHANGED') return 'warning';
    return 'info';
  };

  /** The event as a person reads it. Every underscore, not just the first. */
  const eventLabel = (ev) => String(ev || '').replace(/_/g, ' ');

  /** What the 26px slot shows. The tone is on the slot; this is the shape. */
  const iconFor = (ev) => {
    if (ev === 'LOGIN') return <UserCheck size={14} />;
    if (ev === 'LOGIN_FAILED') return <ShieldOff size={14} />;
    if (ev === 'PASSWORD_RESET' || ev === 'PASSWORD_CHANGED') return <KeyRound size={14} />;
    if (ev === 'LOGOFF') return <LogOut size={14} />;
    return <Activity size={14} />;
  };

  return (
    <section className="nx-rec-card">
      <header className="nx-rec-card__head">
        <span className="nx-rec-card__icon"><Clock size={16} /></span>
        <div className="nx-rec-card__titles"><h2 className="nx-rec-card__title">Login & Security History</h2></div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['', 'LOGIN', 'LOGIN_FAILED', 'LOGOFF'].map((ev) => (
            <button key={ev || 'all'} type="button" className={`u360-permtoggle${event === ev ? ' is-on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => { setEvent(ev); setPage(1); }}>
              {ev === '' ? 'All' : ev.replace('_', ' ')}
            </button>
          ))}
        </div>
      </header>
      <div className="nx-rec-card__body">
        {!data ? <Skeleton rows={5} /> : data.items.length === 0 ? (
          <EmptyState icon={Clock} title="No matching history" />
        ) : (
          <>
            {data.items.map((l) => (
              <div key={l.id} className="u360-audit__item">
                {/* The slot is a 26px square in the grid, so it holds an icon.
                    It used to hold a full-width <Pill> instead, which overflowed
                    the column and sat on top of the title beside it — and the
                    pill repeated the very text it was covering. The tone now
                    rides on the icon, using the is-danger/is-success/is-warning
                    classes User360.css already defines for exactly this. */}
                <span className={`u360-audit__icon is-${toneFor(l.event)}`}>
                  {iconFor(l.event)}
                </span>
                <div className="u360-audit__body">
                  <div className="u360-audit__title">{eventLabel(l.event)}</div>
                  <div className="u360-audit__diff">IP {formatIp(l.ipAddress) || '—'}</div>
                </div>
                <span className="u360-audit__when">{formatDateTime(l.createdAt)}</span>
              </div>
            ))}
            {data.pages > 1 && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: '12px 0 2px 0' }}>
                <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span style={{ fontSize: 13, color: 'var(--nx-text-muted)', alignSelf: 'center' }}>Page {data.page} of {data.pages}</span>
                <Button size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** Field-level audit trail, from UserAuditLog. */
function AuditTab({ userId, limit = 50, compact = false }) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const take = compact ? 5 : limit;

  useEffect(() => {
    fetch(`/api/users/${userId}/audit?page=${page}&limit=${take}`)
      .then((r) => (r.ok ? r.json() : { items: [], pages: 0 }))
      .then(setData)
      .catch(() => setData({ items: [], pages: 0 }));
  }, [userId, page, take]);

  return (
    <section className="nx-rec-card">
      <header className="nx-rec-card__head">
        <span className="nx-rec-card__icon"><FileText size={16} /></span>
        <div className="nx-rec-card__titles">
          <h2 className="nx-rec-card__title">Audit Trail</h2>
          {!compact && <p className="nx-rec-card__sub">Every field change, with the values either side. Read-only by design.</p>}
        </div>
      </header>
      <div className="nx-rec-card__body">
        {!data ? <Skeleton rows={4} /> : data.items.length === 0 ? (
          <EmptyState icon={FileText} title="Nothing recorded yet" hint="Changes to this user will appear here." />
        ) : (
          <>
            {data.items.map((a) => {
              const meta = auditMetaFor(a.action);
              const Icon = meta.icon;
              return (
                <div key={a.id} className="u360-audit__item">
                  <span className={`u360-audit__icon is-${meta.tone}`}><Icon size={14} /></span>
                  <div>
                    <div className="u360-audit__title">{meta.label}{a.actor ? ` · by ${a.actor}` : ''}</div>
                    <div className="u360-audit__diff">
                      {a.field && <code>{prettyField(a.field)}</code>}
                      {a.field && (a.oldValue || a.newValue) ? (
                        <>{a.oldValue ? <><code>{a.oldValue.length > 40 ? `${a.oldValue.slice(0, 40)}…` : a.oldValue}</code><span className="arrow">→</span></> : null}<code>{a.newValue && a.newValue.length > 40 ? `${a.newValue.slice(0, 40)}…` : (a.newValue || '(empty)')}</code></>
                      ) : a.note ? a.note : null}
                    </div>
                  </div>
                  <span className="u360-audit__when">{formatDateTime(a.createdAt)}</span>
                </div>
              );
            })}
            {data.pages > 1 && !compact && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: '12px 0 2px 0' }}>
                <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span style={{ fontSize: 13, color: 'var(--nx-text-muted)', alignSelf: 'center' }}>Page {data.page} of {data.pages}</span>
                <Button size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** Status history (who moved the account, when, why). */
function StatusHistoryCard({ userId }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    fetch(`/api/users/${userId}/status-history`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setItems)
      .catch(() => setItems([]));
  }, [userId]);

  return (
    <section className="nx-rec-card">
      <header className="nx-rec-card__head">
        <span className="nx-rec-card__icon"><ShieldOff size={16} /></span>
        <div className="nx-rec-card__titles"><h2 className="nx-rec-card__title">Status History</h2></div>
      </header>
      <div className="nx-rec-card__body">
        {!items ? <Skeleton rows={3} /> : items.length === 0 ? (
          <EmptyState icon={ShieldOff} title="No status changes yet" />
        ) : items.slice(0, 6).map((h) => (
          <div key={h.id} className="u360-audit__item">
            <span className="u360-audit__icon is-warning"><ShieldOff size={14} /></span>
            <div>
              <div className="u360-audit__title">{h.fromStatus || '—'} → {h.toStatus}</div>
              <div className="u360-audit__diff">{h.changedBy ? `by ${h.changedBy}` : ''}{h.reason ? ` · ${h.reason}` : ''}</div>
            </div>
            <span className="u360-audit__when">{formatDateTime(h.changedAt)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Organization panel: manager chain, reports, editable org fields. */
function OrganizationPanel({ userId, fullUser, overview, departments, canEdit, onSaved }) {
  const [reporting, setReporting] = useState(null);
  const [org, setOrg] = useState(() => ({
    designation: fullUser.designation || '', dept_id: fullUser.dept_id || '',
    employeeId: fullUser.employeeId || '', branch: fullUser.branch || '',
    location: fullUser.location || '', joiningDate: (fullUser.joiningDate || '').slice(0, 10),
    employmentType: fullUser.employmentType || '', team: fullUser.team || '',
  }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/users/${userId}/reporting`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setReporting)
      .catch(() => setReporting(null));
  }, [userId]);

  useEffect(() => {
    setOrg({
      designation: fullUser.designation || '', dept_id: fullUser.dept_id || '',
      employeeId: fullUser.employeeId || '', branch: fullUser.branch || '',
      location: fullUser.location || '', joiningDate: (fullUser.joiningDate || '').slice(0, 10),
      employmentType: fullUser.employmentType || '', team: fullUser.team || '',
    });
  }, [fullUser.designation, fullUser.dept_id, fullUser.employeeId, fullUser.branch, fullUser.location, fullUser.joiningDate, fullUser.employmentType, fullUser.team]);

  const save = async () => {
    setSaving(true);
    try {
      await json(await fetch(`/api/users/${userId}/organization`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(org),
      }));
      window.appAlert('Organization details saved.');
      onSaved?.();
    } catch (e) { window.appAlert(e.message); } finally { setSaving(false); }
  };

  const nameOf = (u) => `${u.firstName || u.username}${u.lastName ? ` ${u.lastName}` : ''}`;

  return (
    <div className="u360-grid">
      <section className="nx-rec-card">
        <header className="nx-rec-card__head"><span className="nx-rec-card__icon"><Building2 size={16} /></span>
          <div className="nx-rec-card__titles"><h2 className="nx-rec-card__title">Reporting Structure</h2></div></header>
        <div className="nx-rec-card__body">
          {!reporting ? <Skeleton rows={4} /> : (
            <div className="u360-org">
              {[...reporting.chain].reverse().map((m) => (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div className="u360-org__node">
                    <div className="u360-avatar u360-avatar--sm">{(m.firstName || m.username || '?')[0]}</div>
                    <div><div className="u360-org__name">{nameOf(m)}</div><div className="u360-org__sub">{m.designation || m.status}</div></div>
                  </div>
                  <div className="u360-org__connector" />
                </div>
              ))}
              <div className="u360-org__node is-self">
                <div className="u360-avatar u360-avatar--sm">{(fullUser.firstName || fullUser.username || '?')[0]}</div>
                <div><div className="u360-org__name">{nameOf(fullUser)} (this user)</div><div className="u360-org__sub">{fullUser.designation || fullUser.status}</div></div>
              </div>
              {reporting.directReports.length > 0 && (
                <>
                  <div className="u360-org__connector" />
                  <div className="u360-org__reports">
                    {reporting.directReports.map((r) => (
                      <div key={r.id} className="u360-org__node" style={{ width: 'auto', minWidth: 150 }}>
                        <div className="u360-avatar u360-avatar--sm">{(r.firstName || r.username || '?')[0]}</div>
                        <div><div className="u360-org__name" style={{ fontSize: 13 }}>{nameOf(r)}</div><div className="u360-org__sub">{r.designation || r.status}</div></div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {overview?.manager && (
            <p style={{ fontSize: 12.5, color: 'var(--nx-text-muted)', marginTop: 12 }}>
              Direct manager: <strong>{overview.manager.username}</strong>. Change it from the header's “Assign Manager”.
            </p>
          )}
        </div>
      </section>

      <section className="nx-rec-card">
        <header className="nx-rec-card__head"><span className="nx-rec-card__icon"><IdCard size={16} /></span>
          <div className="nx-rec-card__titles"><h2 className="nx-rec-card__title">Organization Details</h2></div></header>
        <div className="nx-rec-card__body">
          <RecordFields>
            {/* Three lists that used to be free text, so "Sales Executive",
                "sales exec" and "Sr. Sales Executive" were three roles as far
                as any report was concerned.

                DynamicDropdown is the control the rest of the CRM already uses
                for an editable master — the one on Project Interested, with
                "Add new…" at the bottom and an × per row. Reusing it means
                these behave identically to every other master rather than
                looking like a second way of doing the same thing.

                valueKey is the NAME, not the id: the user record stores the
                name, the same way a lead stores its status name, so nothing
                that already reads user.designation has to change. */}
            <div className="nx-rec-field">
              <span className="nx-rec-field__label">Designation</span>
              <DynamicDropdown
                apiUrl="/api/staff-masters/designation"
                displayKey="name"
                valueKey="name"
                postPayloadKey="name"
                placeholder="Select Designation"
                value={org.designation || ''}
                onChange={(e) => setOrg((p) => ({ ...p, designation: e.target.value }))}
              />
            </div>
            <div className="nx-rec-field">
              <span className="nx-rec-field__label">Department</span>
              <Select
                value={org.dept_id}
                onChange={(e) => setOrg((p) => ({ ...p, dept_id: e.target.value }))}
                placeholder="Choose a department"
                options={[{ value: '', label: '— None —' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
              />
            </div>
            <div className="nx-rec-field">
              <span className="nx-rec-field__label">Branch</span>
              <DynamicDropdown
                apiUrl="/api/staff-masters/branch"
                displayKey="name"
                valueKey="name"
                postPayloadKey="name"
                placeholder="Select Branch"
                value={org.branch || ''}
                onChange={(e) => setOrg((p) => ({ ...p, branch: e.target.value }))}
              />
            </div>
            <div className="nx-rec-field">
              <span className="nx-rec-field__label">Location</span>
              <DynamicDropdown
                apiUrl="/api/staff-masters/location"
                displayKey="name"
                valueKey="name"
                postPayloadKey="name"
                placeholder="Select Location"
                value={org.location || ''}
                onChange={(e) => setOrg((p) => ({ ...p, location: e.target.value }))}
              />
            </div>
            <RecordField label="Joining Date" type="date" value={org.joiningDate} onChange={(v) => setOrg((p) => ({ ...p, joiningDate: v }))} />
            <RecordField label="Employment Type" value={org.employmentType} options={['', 'Full-time', 'Part-time', 'Contract', 'Intern']} onChange={(v) => setOrg((p) => ({ ...p, employmentType: v }))} />
            <RecordField label="Team" value={org.team} onChange={(v) => setOrg((p) => ({ ...p, team: v }))} />
            <RecordField label="Employee ID" value={org.employeeId} onChange={(v) => setOrg((p) => ({ ...p, employeeId: v }))} hint="Unique across the company" />
          </RecordFields>
          {canEdit && (
            <div style={{ marginTop: 14 }}>
              <Button variant="primary" icon={Save} loading={saving} onClick={save}>Save Organization</Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/** Preferences + notification channels; users edit their own, admins anyone's. */
function PreferencesPanel({ userId, onSaved, showNotificationPrefs = false }) {
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/users/${userId}/preferences`, { headers: {} })
      .then((r) => (r.ok ? r.json() : null))
      .then(setPrefs)
      .catch(() => setPrefs(null));
  }, [userId]);

  const set = (key, value) => setPrefs((p) => ({ ...p, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await json(await fetch(`/api/users/${userId}/preferences`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      }));
      window.appAlert('Preferences saved.');
      onSaved?.();
    } catch (e) { window.appAlert(e.message); } finally { setSaving(false); }
  };

  if (!prefs) return <section className="nx-rec-card"><div className="nx-rec-card__body"><Skeleton rows={5} /></div></section>;

  const categories = [
    { key: 'lead', label: 'Lead notifications', desc: 'New leads and handovers' },
    { key: 'opportunity', label: 'Opportunity notifications', desc: 'Stage moves and assignments' },
    { key: 'task', label: 'Task notifications', desc: 'Tasks assigned to them' },
    { key: 'project', label: 'Project notifications', desc: 'Project updates' },
    { key: 'security', label: 'Security notifications', desc: 'Password resets, lockouts — recommended' },
    { key: 'system', label: 'System notifications', desc: 'Administrator messages' },
  ];
  const catPrefs = typeof prefs.categoryPrefs === 'object' && prefs.categoryPrefs ? prefs.categoryPrefs : {};

  return (
    <div className="u360-grid u360-grid--full">
      {showNotificationPrefs ? (
        <section className="nx-rec-card">
          <header className="nx-rec-card__head">
            <span className="nx-rec-card__icon"><BellRing size={16} /></span>
            <div className="nx-rec-card__titles">
              <h2 className="nx-rec-card__title">Notification Channels</h2>
              <p className="nx-rec-card__sub">What this system can actually deliver: the in-app bell and browser push. Email uses the CRM's mail settings for lead events.</p>
            </div>
          </header>
          <div className="nx-rec-card__body">
            <div className="u360-notifrow">
              <div><div className="u360-notifrow__name">In-App Bell</div><div className="u360-notifrow__desc">The notifications panel inside the CRM.</div></div>
              <SegToggle value={prefs.inAppNotifications !== false} onChange={(v) => set('inAppNotifications', v)} />
            </div>
            <div className="u360-notifrow">
              <div><div className="u360-notifrow__name">Browser Push</div><div className="u360-notifrow__desc">Delivered to devices where push was opted into.</div></div>
              <SegToggle value={prefs.pushNotifications !== false} onChange={(v) => set('pushNotifications', v)} />
            </div>
            <div className="u360-notifrow">
              <div><div className="u360-notifrow__name">Email</div><div className="u360-notifrow__desc">Recorded as a preference; email delivery itself depends on the Mail Settings module.</div></div>
              <SegToggle value={prefs.emailNotifications !== false} onChange={(v) => set('emailNotifications', v)} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--nx-text-muted)', margin: '10px 0 4px 0' }}>Per-category bell &amp; push:</p>
            {categories.map((c) => (
              <div key={c.key} className="u360-notifrow">
                <div><div className="u360-notifrow__name" style={{ fontSize: 13.5 }}>{c.label}</div><div className="u360-notifrow__desc">{c.desc}</div></div>
                <SegToggle value={catPrefs[c.key] !== false} onChange={(v) => set('categoryPrefs', { ...catPrefs, [c.key]: v })} />
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="nx-rec-card">
          <header className="nx-rec-card__head">
            <span className="nx-rec-card__icon"><SlidersHorizontal size={16} /></span>
            <div className="nx-rec-card__titles">
              <h2 className="nx-rec-card__title">Display Preferences</h2>
              <p className="nx-rec-card__sub">Personal choices, kept apart from the global system settings.</p>
            </div>
          </header>
          <div className="nx-rec-card__body">
            <RecordFields>
              <RecordField label="Language" value={prefs.language} options={['English']} onChange={(v) => set('language', v)} hint="More languages can be added to this list" />
              <RecordField label="Timezone" value={prefs.timezone} options={['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'UTC']} onChange={(v) => set('timezone', v)} />
              <RecordField label="Date Format" value={prefs.dateFormat} options={['DD MMM YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']} onChange={(v) => set('dateFormat', v)} />
              <RecordField label="Time Format" value={prefs.timeFormat} options={['12h', '24h']} onChange={(v) => set('timeFormat', v)} />
              <div className="nx-rec-field">
                <span className="nx-rec-field__label">Default Page Size</span>
                <Select value={String(prefs.pageSize)} onChange={(e) => set('pageSize', parseInt(e.target.value, 10))} options={['10', '25', '50', '100', '200'].map((n) => ({ value: n, label: `${n} rows` }))} />
              </div>
            </RecordFields>
          </div>
        </section>
      )}
      <div>
        <Button variant="primary" icon={Save} loading={saving} onClick={save}>Save Preferences</Button>
      </div>
    </div>
  );
}

export default UserAdminEdit;
