import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
// Trigger HMR update
import { Eye, EyeOff, User, Lock, ArrowRight, ArrowLeft } from 'lucide-react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Preloader from './components/Preloader';
import LoginLayout from './login/LoginLayout';
import SignInCard from './login/SignInCard';
import './ui/globalConfirm';

// Lazy load layout components and pages
import NotFound from './NotFound';
import usePageMeta from './hooks/usePageMeta';
import { applyPageMeta, SIGNED_OUT_META } from './utils/pageMeta';
import { setAuth, getToken, getUsername, getSessionId, clearAuth } from './utils/sessionStore';
import { connectRealtime, disconnectRealtime } from './utils/realtime';
import TwoFactorCard from './login/TwoFactorCard';
import CompanySignupCard from './login/CompanySignupCard';

const lazyWithRetry = (componentImport) =>
  lazy(async () => {
    try {
      return await componentImport();
    } catch (error) {
      const lastReload = Number(sessionStorage.getItem('vite-last-reload') || 0);
      if (Date.now() - lastReload > 5000) {
        sessionStorage.setItem('vite-last-reload', Date.now());
        window.location.reload();
      }
      throw error;
    }
  });

const Dashboard = lazyWithRetry(() => import('./Dashboard'));
const DashboardOverview = lazyWithRetry(() => import('./DashboardOverview'));
const Leads = lazyWithRetry(() => import('./Leads'));
const TeamChat = lazyWithRetry(() => import('./teamchat/TeamChat'));
const AssistantPage = lazyWithRetry(() => import('./assistant/AssistantPage'));
const LeadProfile = lazyWithRetry(() => import('./LeadProfile'));
const ImportLeads = lazyWithRetry(() => import('./ImportLeads'));
const Opportunities = lazyWithRetry(() => import('./Opportunities'));
const OpportunityProfile = lazyWithRetry(() => import('./OpportunityProfile'));
const Customers = lazyWithRetry(() => import('./Customers'));
const Report = lazyWithRetry(() => import('./Report'));
const ChannelPartners = lazyWithRetry(() => import('./ChannelPartners'));
const CreateChannelPartner = lazyWithRetry(() => import('./CreateChannelPartner'));
const EditChannelPartner = lazyWithRetry(() => import('./EditChannelPartner'));
const RRQ = lazyWithRetry(() => import('./RRQ'));
const ProjectsList = lazyWithRetry(() => import('./ProjectsList'));

const CampaignLeads = lazyWithRetry(() => import('./CampaignLeads'));

const EditProject = lazyWithRetry(() => import('./EditProject'));
const ProjectStatusList = lazyWithRetry(() => import('./ProjectStatusList'));
const ProjectTypeList = lazyWithRetry(() => import('./ProjectTypeList'));
const PrimarySourceList = lazyWithRetry(() => import('./PrimarySourceList'));
const SecondarySourceList = lazyWithRetry(() => import('./SecondarySourceList'));
const TertiarySourceList = lazyWithRetry(() => import('./TertiarySourceList'));
const LeadStatusList = lazyWithRetry(() => import('./LeadStatusList'));
const LeadTypeList = lazyWithRetry(() => import('./LeadTypeList'));
const UserAdmin = lazyWithRetry(() => import('./UserAdmin'));
const UserGroupList = lazyWithRetry(() => import('./UserGroupList'));
const RegistrationSettings = lazyWithRetry(() => import('./RegistrationSettings'));
const SessionSettings = lazyWithRetry(() => import('./SessionSettings'));
const LeadAssignmentSettings = lazyWithRetry(() => import('./LeadAssignmentSettings'));
const ReminderSettings = lazyWithRetry(() => import('./ReminderSettings'));
const UserSettings = lazyWithRetry(() => import('./UserSettings'));
const SecuritySettings = lazyWithRetry(() => import('./SecuritySettings'));
const LogsSettings = lazyWithRetry(() => import('./LogsSettings'));
const MailSettings = lazyWithRetry(() => import('./MailSettings'));
const EmailTemplates = lazyWithRetry(() => import('./EmailTemplates'));
const MyProfile = lazyWithRetry(() => import('./MyProfile'));
const BookingsPage = lazyWithRetry(() => import('./features/BookingsPage'));
const IntegrationsPage = lazyWithRetry(() => import('./features/IntegrationsPage'));
const PlatformPage = lazyWithRetry(() => import('./features/PlatformPage'));
const PartnerPortal = lazyWithRetry(() => import('./features/PartnerPortal'));
const BillingPage = lazyWithRetry(() => import('./features/BillingPage'));
const ReportBuilderPage = lazyWithRetry(() => import('./features/ReportBuilderPage'));

/**
 * Keeps the tab title and meta tags in step with the route.
 *
 * It has to be inside <BrowserRouter> to read the location, so it is its own
 * component rather than a call in App.
 */
function RouteMeta() {
  usePageMeta();
  return null;
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // Set when the password was right but the account needs its 2FA code.
  const [twoFactorChallenge, setTwoFactorChallenge] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  /* An administrator can flag an account so its next sign-in must set a new
     password. The login response carries mustChangePassword; the flag lives in
     localStorage across the redirect and this screen takes over the whole app
     until the password is changed. */
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changeError, setChangeError] = useState('');
  const [changeBusy, setChangeBusy] = useState(false);

  useEffect(() => {
    if (isLoggedIn && localStorage.getItem('forcePasswordChange') === '1') {
      setNeedsPasswordChange(true);
    }
  }, [isLoggedIn]);

  // Live updates while signed in (utils/realtime.js); polling remains the fallback.
  useEffect(() => {
    if (!isLoggedIn) return undefined;
    connectRealtime();
    return () => disconnectRealtime();
  }, [isLoggedIn]);

  const handleChangeMyPassword = async (e) => {
    e.preventDefault();
    setChangeError('');
    if (!currentPassword || !newPw) { setChangeError('Enter your current and new password.'); return; }
    if (newPw !== confirmPw) { setChangeError('Passwords do not match.'); return; }
    if (newPw.length < 10 || !/[0-9]/.test(newPw) || !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>?]/.test(newPw)) {
      setChangeError('Min 10 characters, at least one number and one special character.');
      return;
    }
    setChangeBusy(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Username': localStorage.getItem('loggedInUser') || '' },
        body: JSON.stringify({ currentPassword, newPassword: newPw, sessionId: getSessionId() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setChangeError(data.message || 'Could not change the password.'); return; }
      localStorage.removeItem('forcePasswordChange');
      setNeedsPasswordChange(false);
      setCurrentPassword(''); setNewPw(''); setConfirmPw('');
    } catch {
      setChangeError('Could not reach the server.');
    } finally {
      setChangeBusy(false);
    }
  };

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const loginFormRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState(getUsername());
  // "Remember me" decides where the session token lives (localStorage vs
  // sessionStorage) and how long the backend session row lasts. Ticking it
  // used to do nothing at all.
  const [rememberMe, setRememberMe] = useState(false);

  // Password reset flow: 'login' | 'forgot' | 'reset'
  const [view, setView] = useState(() => (new URLSearchParams(window.location.search).get('signup') === '1' ? 'start' : 'login'));
  /* A company's own sign-in link (?company=slug), or its own domain
     (crm.roofonwalls.com), shows its logo and name. */
  const [brand, setBrand] = useState(null);
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('company');
    fetch(slug ? `/api/public/branding?company=${encodeURIComponent(slug)}` : '/api/public/branding')
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!b) return;
        setBrand(b);
        if (b.brandColor) document.documentElement.style.setProperty('--nx-accent', b.brandColor);
      })
      .catch(() => {});
  }, []);
  const [forgotInput, setForgotInput] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  /**
   * Adopts whatever the browser autofilled into the sign-in fields.
   *
   * Chrome writes a remembered username and password straight into the DOM
   * without firing an input event, so React never hears about it. Two things
   * then go wrong: the floating label has no `has-val` to react to and sits on
   * top of the text, and — the one that matters — handleLogin posts the empty
   * state while the screen plainly shows credentials.
   *
   * Autofill can land a beat after first paint, so the fields are read a few
   * times across the first second rather than once on mount. Only a non-empty
   * value is adopted: clearing a field by hand must not be undone here.
   */
  useEffect(() => {
    if (view !== 'login') return undefined;

    const sync = () => {
      const form = loginFormRef.current;
      if (!form) return;
      const u = form.querySelector('#login-username');
      const p = form.querySelector('#login-password');
      if (u?.value) setUsername((prev) => (prev === u.value ? prev : u.value));
      if (p?.value) setPassword((prev) => (prev === p.value ? prev : p.value));
    };

    const timers = [0, 120, 400, 1000].map((ms) => setTimeout(sync, ms));
    return () => timers.forEach(clearTimeout);
  }, [view]);
  const [forgotError, setForgotError] = useState('');
  const [forgotInfo, setForgotInfo] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetInfo, setResetInfo] = useState('');
  // Sign-up flow: 'login' | 'forgot' | 'reset' | 'signup'
  const [signupInfo, setSignupInfo] = useState('');
  const [signupError, setSignupError] = useState('');
  const [signupRules, setSignupRules] = useState(null);
  const [signupBusy, setSignupBusy] = useState(false);
  // Email-activation link result: null | 'working' | 'done' | 'failed'
  const [activationState, setActivationState] = useState(null);
  const [activationMessage, setActivationMessage] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupFirstName, setSignupFirstName] = useState('');
  const [signupLastName, setSignupLastName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirm, setSignupConfirm] = useState('');

  useEffect(() => {
    const token = getToken();
    if (token) {
      setIsLoggedIn(true);
    }

    // A password reset email links back to /?resetToken=... — pick it up so
    // the user lands straight on the "set new password" screen.
    const params = new URLSearchParams(window.location.search);
    const resetTokenParam = params.get('resetToken');
    if (resetTokenParam) {
      setResetToken(resetTokenParam);
      setView('reset');
      // Remove the token from the address bar so it doesn't linger in history.
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    /* The sign-in card no longer offers "Create one", so /?signup=1 is the way
       in to the registration form. The form and its rules are unchanged —
       Registration Settings still decides whether the server accepts a signup
       at all, which is where to turn it off properly rather than by hiding a
       link. */
    if (params.get('signup') === '1') {
      openSignup();
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    // The fetch wrapper bounces here when a call comes back 401: the session
    // was revoked or expired. Say so, instead of presenting a bare login form.
    if (params.get('session') === 'ended') {
      setError('Your session has ended. Please sign in again.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    // The activation email links back to /?activation=... — run it and say so.
    const activation = params.get('activation');
    if (activation) {
      setActivationState('working');
      fetch(`/api/auth/activate/${encodeURIComponent(activation)}`, { method: 'POST' })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            setActivationState('done');
            setActivationMessage(data.message || 'Your account is active. You can sign in now.');
          } else {
            setActivationState('failed');
            setActivationMessage(data.message || 'This activation link is not valid.');
          }
        })
        .catch(() => {
          setActivationState('failed');
          setActivationMessage('Could not reach the server to activate the account.');
        });
      // The token in the address bar has done its job; do not leave it there.
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
  },
    /* Deliberately mount-only: this reads the address bar once and clears it.
       Listing openSignup would re-run the whole block on every render, redoing
       the activation fetch and the history rewrite. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);

  const handleLogout = async () => {
    // The fetch wrapper attaches the session token, so the backend revokes
    // the exact row this browser holds. The token is cleared only after the
    // call — clearing it first would log out anonymously and leave the row live.
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
    } catch (e) {
      console.error('Logout error:', e);
    }
    setIsLoggedIn(false);
    setLoggedInUser('');
    // Wipes both stores, userStatus and forcePasswordChange with them.
    disconnectRealtime();
    clearAuth();
    window.location.href = '/';
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // The server records the IP it sees through nginx; nothing to look up here.
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        // rememberMe decides how long the server keeps the session; it was
        // never sent, so every session lasted one day whatever the box said.
        body: JSON.stringify({ username, password, rememberMe })
      });

      const data = await response.json();

      if (response.ok && data.twoFactorRequired) {
        setTwoFactorChallenge(data.challenge);
        return;
      }
      if (response.ok) {
        finishLogin(data);
        return;
      }
      setError(data.message || 'Login failed');
    } catch {
      setError('Could not connect to the server. Make sure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  /** Second step: the authenticator or recovery code. */
  const handleTwoFactor = async (code) => {
    setError('');
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge: twoFactorChallenge, code }),
      });
      const data = await response.json();
      if (response.ok) {
        finishLogin(data);
        return;
      }
      if (response.status === 401 && /expired/i.test(data.message || '')) setTwoFactorChallenge(null);
      setError(data.message || 'That code did not work.');
    } catch {
      setError('Could not connect to the server.');
    } finally {
      setIsLoading(false);
    }
  };

  /** Store the session and go to the user's home page. */
  const finishLogin = (data) => {
    // Remember me → localStorage (survives the browser closing); otherwise
    // sessionStorage (dies with the tab). The backend session row matches:
    // cookie-expiry days for remembered, one day otherwise.
    setAuth(
      /* The account's own username, not what was typed into the box. Now
         that an email address signs in too, storing the typed value left
         every screen asking the API for a user called
         "someone@example.com" — a name no account has. */
      {
        token: data.token,
        username: data.user?.username || username,
        sessionId: data.sessionId,
        status: data.user?.status,
      },
      rememberMe,
    );
    if (data.mustChangePassword) {
      localStorage.setItem('forcePasswordChange', '1');
    } else {
      localStorage.removeItem('forcePasswordChange');
    }
    // Individual home pages (GlobalUserSetting) land the user where the
    // administrator pointed them; null falls back to the dashboard.
    const home = data.homePage || '/';
    window.location.href = home.startsWith('/') ? home : '/';
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotInfo('');
    if (!forgotInput.trim()) {
      setForgotError('Please enter your username or email.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: forgotInput.trim() })
      });
      const data = await response.json();
      if (response.ok) {
        // The backend never returns the token in the response (that was an
        // account-takeover hole); the link arrives by email only. The reply
        // is deliberately the same whether or not the account exists.
        setForgotInfo(data.message || 'If an account exists for that username or email, a password reset link has been sent.');
        setForgotInput('');
      } else {
        setForgotError(data.message || 'Something went wrong. Please try again.');
      }
    } catch {
      setForgotError('Could not connect to the server. Make sure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetInfo('');
    if (!newPassword || !confirmPassword) {
      setResetError('Please enter and confirm your new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword })
      });
      const data = await response.json();
      if (response.ok) {
        setResetInfo(data.message || 'Password reset successful!');
        setTimeout(() => {
          goToLogin();
        }, 2500);
      } else {
        setResetError(data.message || 'Unable to reset password. Please request a new link.');
      }
    } catch {
      setResetError('Could not connect to the server. Make sure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const goToLogin = () => {
    setView('login');
    setForgotInput('');
    setForgotError('');
    setForgotInfo('');
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
    setResetError('');
    setResetInfo('');
    setSignupInfo('');
    setSignupError('');
  };

  /**
   * Self-service signup — the endpoint Registration Settings has always
   * described but nothing used. The rules (lengths, character set, captcha)
   * are fetched from the server so the form shows what the server enforces,
   * not a copy that can drift.
   */
  const openSignup = async () => {
    setView('signup');
    setSignupError('');
    setSignupInfo('');
    if (!signupRules) {
      try {
        const res = await fetch('/api/auth/activation-rules');
        if (res.ok) setSignupRules(await res.json());
      } catch { /* the form still renders with server-side validation */ }
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setSignupError('');
    setSignupInfo('');
    if (!signupUsername.trim() || !signupFirstName.trim() || !signupEmail.trim() || !signupPassword) {
      setSignupError('Please fill in every field.');
      return;
    }
    if (signupPassword !== signupConfirm) {
      setSignupError('Passwords do not match.');
      return;
    }
    setSignupBusy(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: signupUsername.trim(),
          firstName: signupFirstName.trim(),
          lastName: signupLastName.trim() || undefined,
          email: signupEmail.trim(),
          password: signupPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.token) {
          // Immediate access: signed in straight away.
          setAuth(
            {
              token: data.token,
              username: data.user?.username || signupUsername.trim(),
              sessionId: data.sessionId,
              status: data.user?.status,
            },
            false,
          );
          window.location.href = '/';
          return;
        }
        setSignupInfo(data.message || 'Account created.');
        setSignupUsername('');
        setSignupFirstName('');
        setSignupLastName('');
        setSignupEmail('');
        setSignupPassword('');
        setSignupConfirm('');
      } else {
        setSignupError(data.message || 'Could not create the account.');
      }
    } catch {
      setSignupError('Could not reach the server. Make sure the backend is running.');
    } finally {
      setSignupBusy(false);
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };


  // The login screen renders outside the router, so RouteMeta never covers it.
  // It is also the only view a crawler can reach, hence the one that is
  // indexable.
  useEffect(() => {
    if (!isLoggedIn) applyPageMeta(SIGNED_OUT_META);
  }, [isLoggedIn]);

  /* The forced password-change screen. Shown instead of the whole app until
     the user sets a new password, so nothing else can be reached first. */
  if (isLoggedIn && needsPasswordChange) {
    return (
      <div className="login-container-premium theme-dark">
        <div className="login-card-premium">
          <div className="login-header-premium">
            <h2>Set a New Password</h2>
            <p>Your administrator requires a password change before you continue.</p>
          </div>
          {changeError && <div className="login-global-error error fade-in">{changeError}</div>}
          <form onSubmit={handleChangeMyPassword} className="login-form-premium">
            <div className="input-group-premium">
              <div className={`input-wrapper-premium ${currentPassword ? 'has-val' : ''}`}>
                <Lock className="input-icon-p" size={20} />
                <input id="cur-pw" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
                <label className="floating-label" htmlFor="cur-pw">Current Password</label>
                <div className="input-highlight"></div>
              </div>
            </div>
            <div className="input-group-premium">
              <div className={`input-wrapper-premium ${newPw ? 'has-val' : ''}`}>
                <Lock className="input-icon-p" size={20} />
                <input id="new-pw" type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required />
                <label className="floating-label" htmlFor="new-pw">New Password</label>
                <div className="input-highlight"></div>
              </div>
            </div>
            <div className="input-group-premium">
              <div className={`input-wrapper-premium ${confirmPw ? 'has-val' : ''}`}>
                <Lock className="input-icon-p" size={20} />
                <input id="conf-pw" type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required />
                <label className="floating-label" htmlFor="conf-pw">Confirm New Password</label>
                <div className="input-highlight"></div>
              </div>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12.5, margin: '0 0 10px 4px' }}>
              Min 10 characters, at least one number and one special character.
            </p>
            <button type="submit" className="btn-sign-in-premium glow-effect" disabled={changeBusy}>
              {changeBusy ? 'Saving...' : (
                <span className="btn-content-p">
                  Update Password
                  <ArrowRight size={20} className="btn-arrow" />
                </span>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Channel partners get the partner portal and nothing else (the server enforces the same).
  if (isLoggedIn && localStorage.getItem('userStatus') === 'Partner') {
    return (
      <Suspense fallback={<Preloader />}>
        <PartnerPortal onLogout={handleLogout} />
      </Suspense>
    );
  }

  if (isLoggedIn) {
    return (
      <BrowserRouter>
        <RouteMeta />
        <Suspense fallback={<Preloader />}>
          <Routes>
            <Route path="/" element={<Dashboard onLogout={handleLogout} loggedInUser={loggedInUser} />}>
              <Route index element={<DashboardOverview />} />
              <Route path="leads" element={<Leads />} />
              <Route path="team-chat" element={<TeamChat />} />
              <Route path="assistant" element={<AssistantPage />} />
              <Route path="leads/:id" element={<LeadProfile />} />
              <Route path="import-leads" element={<ImportLeads />} />
              <Route path="duplicate-leads" element={<Navigate to="/leads?tab=duplicate" replace />} />
              <Route path="rejected-leads" element={<Navigate to="/leads?tab=rejected" replace />} />
              <Route path="site-visits" element={<Navigate to="/leads?tab=site-visit" replace />} />
              <Route path="follow-up-leads" element={<Navigate to="/leads?tab=follow-up" replace />} />
              <Route path="opportunities" element={<Opportunities />} />
              <Route path="opportunities/:id" element={<OpportunityProfile />} />
              <Route path="customers" element={<Customers />} />
              <Route path="report" element={<Report />} />
              <Route path="channel-partners" element={<ChannelPartners />} />
              <Route path="channel-partners/create" element={<CreateChannelPartner />} />
              <Route path="channel-partners/edit/:id" element={<EditChannelPartner />} />
              <Route path="rrq" element={<RRQ />} />
              <Route path="campaign-leads" element={<CampaignLeads />} />
              <Route path="projects/list" element={<ProjectsList />} />
              <Route path="projects/edit/:id" element={<EditProject />} />
              <Route path="projects/status" element={<ProjectStatusList />} />
              <Route path="projects/type" element={<ProjectTypeList />} />
              <Route path="lead-source/primary" element={<PrimarySourceList />} />
              <Route path="lead-source/secondary" element={<SecondarySourceList />} />
              <Route path="lead-source/tertiary" element={<TertiarySourceList />} />
              <Route path="lead-source/status" element={<LeadStatusList />} />
              <Route path="lead-source/type" element={<LeadTypeList />} />
              <Route path="settings/user-admin" element={<UserAdmin />} />
              <Route path="settings/user-admin/edit/:id" element={<UserAdmin />} />
              <Route path="settings/user-groups" element={<UserGroupList />} />
              <Route path="settings/registration" element={<RegistrationSettings />} />
              <Route path="settings/session" element={<SessionSettings />} />
              <Route path="settings/lead-assignment" element={<LeadAssignmentSettings />} />
              <Route path="settings/reminders" element={<ReminderSettings />} />
              <Route path="settings/user" element={<UserSettings />} />
              <Route path="settings/security" element={<SecuritySettings />} />
              <Route path="settings/logs" element={<LogsSettings />} />
              <Route path="settings/mail" element={<MailSettings />} />
              <Route path="settings/email-templates" element={<EmailTemplates />} />
              <Route path="settings/integrations" element={<IntegrationsPage />} />
              <Route path="settings/billing" element={<BillingPage />} />
              <Route path="bookings" element={<BookingsPage />} />
              <Route path="report-builder" element={<ReportBuilderPage />} />
              <Route path="platform/companies" element={<PlatformPage />} />
              <Route path="my-profile" element={<MyProfile loggedInUser={loggedInUser} />} />

              {/* The login screen renders outside the router, so /login has no
                  route of its own. Anyone who lands there is already signed in. */}
              <Route path="login" element={<Navigate to="/" replace />} />

              {/* Anything else: explain it, inside the shell, with a way out. */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    );
  }

  return (
    <LoginLayout theme={theme} onToggleTheme={toggleTheme} brand={brand}>
      {view === 'start' ? (
        <CompanySignupCard
          onBack={() => setView('login')}
          onCreated={async (creds) => {
            // Signed straight in with what they just chose.
            const response = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...creds, rememberMe: true }),
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data.token) finishLogin(data);
            else { setView('login'); setError(data.message || 'Your company is ready — please sign in.'); }
          }}
        />
      ) : view === 'login' && twoFactorChallenge ? (
        <TwoFactorCard
          isLoading={isLoading}
          error={error}
          onSubmit={handleTwoFactor}
          onBack={() => { setTwoFactorChallenge(null); setError(''); }}
        />
      ) : view === 'login' ? (
        <SignInCard
          theme={theme}
          brandName={brand?.name}
          username={username}
          onUsernameChange={setUsername}
          password={password}
          onPasswordChange={setPassword}
          rememberMe={rememberMe}
          onRememberChange={setRememberMe}
          isLoading={isLoading}
          error={error}
          /* The result of following an emailed activation link
             (?activation=...), shown where a sign-in error would be. */
          notice={activationState === 'working'
            ? 'Activating your account…'
            : (activationState === 'done' || activationState === 'failed') ? activationMessage : null}
          noticeTone={activationState === 'failed' ? 'error' : 'info'}
          onSubmit={handleLogin}
          onForgot={() => setView('forgot')}
          onError={setError}
          onBusyChange={setIsLoading}
          formRef={loginFormRef}
        />
      ) : null}
      {view === 'login' && !twoFactorChallenge && !brand && (
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: 'var(--nx-text-secondary, #94a3b8)' }}>
          New to NexorCRM?{' '}
          <button type="button" className="nx-card__link" onClick={() => { setError(''); setView('start'); }}>Start a free trial</button>
        </p>
      )}
      {view === 'login' || view === 'start' ? null : (
        /* Sign-up, forgot-password and reset keep the card they already had.
           Only the sign-in step was redesigned; restyling the other three is a
           separate piece of work, and they sit inside the new shell meanwhile. */
        <div className="login-card-premium">
          <div className="login-brand-premium">
            <img
              src={theme === 'dark' ? '/logo_light.png' : '/logo_dark.png'}
              alt="NexorCRM Logo"
              className="login-brand-logo-file"
            />
          </div>


          {view === 'signup' && (
            <>
              <div className="login-header-premium">
                <h2>Create your account</h2>
                <p>Sign up for a NexorCRM account.</p>
              </div>

              {signupError && <div className="login-global-error error fade-in">{signupError}</div>}
              {signupInfo && <div className="login-global-info fade-in">{signupInfo}</div>}

              <form onSubmit={handleSignup} className="login-form-premium">
                <div className="input-group-premium">
                  <div className={`input-wrapper-premium ${signupUsername ? 'has-val' : ''}`}>
                    <User className="input-icon-p" size={20} />
                    <input
                      id="signup-username"
                      type="text"
                      autoComplete="username"
                      value={signupUsername}
                      onChange={(e) => setSignupUsername(e.target.value)}
                      required
                    />
                    <label className="floating-label" htmlFor="signup-username">Username</label>
                  </div>
                </div>

                <div className="input-group-premium">
                  <div className={`input-wrapper-premium ${signupFirstName ? 'has-val' : ''}`}>
                    <User className="input-icon-p" size={20} />
                    <input
                      id="signup-firstname"
                      type="text"
                      autoComplete="given-name"
                      value={signupFirstName}
                      onChange={(e) => setSignupFirstName(e.target.value)}
                      required
                    />
                    <label className="floating-label" htmlFor="signup-firstname">First Name</label>
                  </div>
                </div>

                <div className="input-group-premium">
                  <div className={`input-wrapper-premium ${signupLastName ? 'has-val' : ''}`}>
                    <User className="input-icon-p" size={20} />
                    <input
                      id="signup-lastname"
                      type="text"
                      autoComplete="family-name"
                      value={signupLastName}
                      onChange={(e) => setSignupLastName(e.target.value)}
                    />
                    <label className="floating-label" htmlFor="signup-lastname">Last Name (optional)</label>
                  </div>
                </div>

                <div className="input-group-premium">
                  <div className={`input-wrapper-premium ${signupEmail ? 'has-val' : ''}`}>
                    <User className="input-icon-p" size={20} />
                    <input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                    />
                    <label className="floating-label" htmlFor="signup-email">Email</label>
                  </div>
                </div>

                <div className="input-group-premium">
                  <div className={`input-wrapper-premium ${signupPassword ? 'has-val' : ''}`}>
                    <Lock className="input-icon-p" size={20} />
                    <input
                      id="signup-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={signupRules?.passwordLengthMin || 8}
                      maxLength={signupRules?.passwordLengthMax || 120}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                    />
                    <label className="floating-label" htmlFor="signup-password">Password</label>
                  </div>
                </div>

                <div className="input-group-premium">
                  <div className={`input-wrapper-premium ${signupConfirm ? 'has-val' : ''}`}>
                    <Lock className="input-icon-p" size={20} />
                    <input
                      id="signup-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={signupConfirm}
                      onChange={(e) => setSignupConfirm(e.target.value)}
                      required
                    />
                    <label className="floating-label" htmlFor="signup-confirm">Confirm Password</label>
                  </div>
                </div>

                {signupRules && (
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12.5, margin: '0 0 10px 4px' }}>
                    Username {signupRules.usernameLengthMin}–{signupRules.usernameLengthMax} characters
                    ({String(signupRules.limitUsernameCharacters || '').toLowerCase()}).
                  </p>
                )}

                <button type="submit" className="btn-sign-in-premium glow-effect" disabled={signupBusy}>
                  {signupBusy ? 'Creating...' : (
                    <span className="btn-content-p">
                      Sign Up
                      <ArrowRight size={20} className="btn-arrow" />
                    </span>
                  )}
                </button>

                <a
                  href="#"
                  className="back-to-login-p"
                  onClick={(e) => { e.preventDefault(); goToLogin(); }}
                >
                  <ArrowLeft size={16} /> Back to login
                </a>
              </form>
            </>
          )}

          {view === 'forgot' && (
            <>
              <div className="login-header-premium">
                <h2>Forgot Password</h2>
                <p>Enter your username or email and we'll send you a reset link.</p>
              </div>

              {forgotError && <div className="login-global-error error fade-in">{forgotError}</div>}
              {forgotInfo && <div className="login-global-info fade-in">{forgotInfo}</div>}

              <form onSubmit={handleForgotPassword} className="login-form-premium">
                <div className="input-group-premium">
                  <div className={`input-wrapper-premium ${forgotInput ? 'has-val' : ''}`}>
                    <User className="input-icon-p" size={20} />
                    <input
                      id="forgot-identifier"
                      name="username"
                      type="text"
                      autoComplete="username"
                      value={forgotInput}
                      onChange={(e) => setForgotInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleForgotPassword(e)}
                      autoFocus
                    />
                    <label className="floating-label" htmlFor="forgot-identifier">Username / Email</label>
                    <div className="input-highlight"></div>
                  </div>
                </div>

                <button type="submit" className="btn-sign-in-premium glow-effect" disabled={isLoading}>
                  {isLoading ? 'Sending...' : (
                    <span className="btn-content-p">
                      Send Reset Link
                      <ArrowRight size={20} className="btn-arrow" />
                    </span>
                  )}
                </button>

                <a
                  href="#"
                  className="back-to-login-p"
                  onClick={(e) => { e.preventDefault(); goToLogin(); }}
                >
                  <ArrowLeft size={16} /> Back to login
                </a>
              </form>
            </>
          )}

          {view === 'reset' && (
            <>
              <div className="login-header-premium">
                <h2>Set New Password</h2>
                <p>Min 10 characters, at least one number and one special character.</p>
              </div>

              {resetError && <div className="login-global-error error fade-in">{resetError}</div>}
              {resetInfo && <div className="login-global-info fade-in">{resetInfo}</div>}

              <form onSubmit={handleResetPassword} className="login-form-premium">
                <div className="input-group-premium">
                  <div className={`input-wrapper-premium ${newPassword ? 'has-val' : ''}`}>
                    <Lock className="input-icon-p" size={20} />
                    <input
                      id="reset-new-password"
                      name="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                    <label className="floating-label" htmlFor="reset-new-password">New Password</label>
                    <button
                      type="button"
                      className="toggle-password-p"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                    <div className="input-highlight"></div>
                  </div>
                </div>

                <div className="input-group-premium">
                  <div className={`input-wrapper-premium ${confirmPassword ? 'has-val' : ''}`}>
                    <Lock className="input-icon-p" size={20} />
                    <input
                      id="reset-confirm-password"
                      name="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                    <label className="floating-label" htmlFor="reset-confirm-password">Confirm New Password</label>
                    <button
                      type="button"
                      className="toggle-password-p"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                    <div className="input-highlight"></div>
                  </div>
                </div>

                <button type="submit" className="btn-sign-in-premium glow-effect" disabled={isLoading}>
                  {isLoading ? 'Resetting...' : (
                    <span className="btn-content-p">
                      Reset Password
                      <ArrowRight size={20} className="btn-arrow" />
                    </span>
                  )}
                </button>

                <a
                  href="#"
                  className="back-to-login-p"
                  onClick={(e) => { e.preventDefault(); goToLogin(); }}
                >
                  <ArrowLeft size={16} /> Back to login
                </a>
              </form>
            </>
          )}
        </div>
      )}
    </LoginLayout>
  );
}

export default App;
