import React, { useState, useEffect, Suspense, lazy } from 'react';
// Trigger HMR update
import { Eye, EyeOff } from 'lucide-react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Preloader from './components/Preloader';

// Lazy load layout components and pages
const Dashboard = lazy(() => import('./Dashboard'));
const DashboardOverview = lazy(() => import('./DashboardOverview'));
const Leads = lazy(() => import('./Leads'));
const LeadProfile = lazy(() => import('./LeadProfile'));
const ImportLeads = lazy(() => import('./ImportLeads'));
const Opportunities = lazy(() => import('./Opportunities'));
const OpportunityProfile = lazy(() => import('./OpportunityProfile'));
const Customers = lazy(() => import('./Customers'));
const Report = lazy(() => import('./Report'));
const ChannelPartners = lazy(() => import('./ChannelPartners'));
const CreateChannelPartner = lazy(() => import('./CreateChannelPartner'));
const EditChannelPartner = lazy(() => import('./EditChannelPartner'));
const RRQ = lazy(() => import('./RRQ'));
const ProjectsList = lazy(() => import('./ProjectsList'));
const PropertiesList = lazy(() => import('./PropertiesList'));
const AddProperty = lazy(() => import('./AddProperty'));
const ServicesList = lazy(() => import('./ServicesList'));
const AddService = lazy(() => import('./AddService'));
const EnquiriesList = lazy(() => import('./EnquiriesList'));
const CampaignLeads = lazy(() => import('./CampaignLeads'));

const EditProject = lazy(() => import('./EditProject'));
const ProjectStatusList = lazy(() => import('./ProjectStatusList'));
const ProjectTypeList = lazy(() => import('./ProjectTypeList'));
const PrimarySourceList = lazy(() => import('./PrimarySourceList'));
const SecondarySourceList = lazy(() => import('./SecondarySourceList'));
const TertiarySourceList = lazy(() => import('./TertiarySourceList'));
const LeadStatusList = lazy(() => import('./LeadStatusList'));
const LeadTypeList = lazy(() => import('./LeadTypeList'));
const UserAdmin = lazy(() => import('./UserAdmin'));
const PageAccess = lazy(() => import('./PageAccess'));
const UserGroupList = lazy(() => import('./UserGroupList'));
const RegistrationSettings = lazy(() => import('./RegistrationSettings'));
const SessionSettings = lazy(() => import('./SessionSettings'));
const UserSettings = lazy(() => import('./UserSettings'));
const SecuritySettings = lazy(() => import('./SecuritySettings'));
const LogsSettings = lazy(() => import('./LogsSettings'));
const MailSettings = lazy(() => import('./MailSettings'));
const EmailTemplates = lazy(() => import('./EmailTemplates'));
const MyProfile = lazy(() => import('./MyProfile'));

// Helper: get the client's public IP address (changes when switching networks)
const getClientIp = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      return data.ip || '';
    }
  } catch { }
  return '';
};

function App() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState(localStorage.getItem('loggedInUser') || '');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsLoggedIn(true);
    }
  }, []);

  const handleLogout = async () => {
    try {
      const clientIp = await getClientIp();
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loggedInUser, clientIp })
      });
    } catch (e) {
      console.error('Logout error:', e);
    }
    setIsLoggedIn(false);
    setLoggedInUser('');
    localStorage.removeItem('token');
    localStorage.removeItem('loggedInUser');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const clientIp = await getClientIp();
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password, clientIp })
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('loggedInUser', username);
        if (data.user && data.user.status) {
          localStorage.setItem('userStatus', data.user.status);
        }
        // Redirect to dashboard on login so the home page always loads
        window.location.href = '/';
        return;
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      setError('Could not connect to the server. Make sure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoggedIn) {
    return (
      <BrowserRouter>
        <Suspense fallback={<Preloader />}>
          <Routes>
            <Route path="/" element={<Dashboard onLogout={handleLogout} loggedInUser={loggedInUser} />}>
              <Route index element={<DashboardOverview />} />
              <Route path="leads" element={<Leads />} />
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
              <Route path="properties" element={<PropertiesList />} />
              <Route path="properties/add" element={<AddProperty />} />
              <Route path="services" element={<ServicesList />} />
              <Route path="services/add" element={<AddService />} />
              <Route path="enquiries" element={<EnquiriesList />} />
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
              <Route path="settings/page-access" element={<PageAccess />} />
              <Route path="settings/user-groups" element={<UserGroupList />} />
              <Route path="settings/registration" element={<RegistrationSettings />} />
              <Route path="settings/session" element={<SessionSettings />} />
              <Route path="settings/user" element={<UserSettings />} />
              <Route path="settings/security" element={<SecuritySettings />} />
              <Route path="settings/logs" element={<LogsSettings />} />
              <Route path="settings/mail" element={<MailSettings />} />
              <Route path="settings/email-templates" element={<EmailTemplates />} />
              <Route path="my-profile" element={<MyProfile loggedInUser={loggedInUser} />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    );
  }

  return (
    <div className="login-container">
      <div className={`login-card ${isRegistering ? 'register-mode' : ''}`}>

        {/* White Panel: Login or Register Form */}
        <div className="login-left">
          {!isRegistering ? (
            <>
              <div className="login-header">
                <h2>Sign in</h2>
                <p>Admin Login</p>
              </div>

              <form onSubmit={handleLogin} className="login-form">
                {error && <div style={{ color: 'red', marginBottom: '10px', fontSize: '14px', background: '#ffebee', padding: '10px', borderRadius: '4px' }}>{error}</div>}

                <div className="input-group">
                  <input
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>

                <div className="input-group">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <button type="submit" className="btn-sign-in" disabled={isLoading}>
                  {isLoading ? 'SIGNING IN...' : 'SIGN IN'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="login-header">
                <h2>Create Account</h2>
                <p>Registration is coming soon</p>
              </div>

              <form className="login-form" onSubmit={(e) => e.preventDefault()}>
                <div className="input-group">
                  <input type="text" placeholder="Name" disabled />
                </div>
                <div className="input-group">
                  <input type="email" placeholder="Email" disabled />
                </div>
                <div className="input-group">
                  <input type="password" placeholder="Password" disabled />
                </div>

                <button type="button" className="btn-sign-in" disabled>
                  COMING SOON
                </button>
              </form>
            </>
          )}
        </div>

        {/* Blue Panel: Welcome or Hello Banner */}
        <div className="login-right">
          <div className="login-right-content">
            <div className="logo-placeholder" style={{ display: 'flex', justifyContent: 'center' }}>
              <img src="/logo_light.png" alt="NexorCRM" style={{ height: '60px', objectFit: 'contain' }} />
            </div>

            {!isRegistering ? (
              <>
                <h3>Welcome Back</h3>
                <p>Sign in to continue managing your dashboard and stay updated.</p>
                <button className="btn-register" onClick={() => setIsRegistering(true)}>REGISTER NOW</button>
              </>
            ) : (
              <>
                <h3>Hello, Friend!</h3>
                <p>Enter your details and start your journey with us.</p>
                <button className="btn-register" onClick={() => setIsRegistering(false)}>SIGN IN</button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
