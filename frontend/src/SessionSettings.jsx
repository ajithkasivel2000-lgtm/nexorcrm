import { useState, useEffect } from 'react';
import { Home } from 'lucide-react';
import './SessionSettings.css';
import { Link } from 'react-router-dom';

const SessionSettings = () => {
  const [settings, setSettings] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const resetExpiryOptions = ['Yes', 'No'];

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings/session');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error fetching session settings:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    
    let parsedValue = value;
    if (type === 'number') {
      parsedValue = parseInt(value, 10);
    }

    setSettings(prev => ({
      ...prev,
      [name]: parsedValue
    }));
  };

  const handleDropdownSelect = (option) => {
    setSettings(prev => ({
      ...prev,
      resetExpiryAtLogon: option
    }));
    setIsDropdownOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const { id, createdAt, updatedAt, ...updateData } = settings;
    
    if (isNaN(updateData.userInactivityTimeout)) updateData.userInactivityTimeout = 20;
    if (isNaN(updateData.guestTimeout)) updateData.guestTimeout = 5;
    if (isNaN(updateData.cookieExpiry)) updateData.cookieExpiry = 14;

    try {
      const response = await fetch('/api/settings/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      if (response.ok) {
        alert('Settings updated successfully!');
      } else {
        alert('Failed to update settings.');
      }
    } catch (error) {
      console.error('Error updating settings:', error);
    }
  };

  if (!settings) return <div>Loading...</div>;

  return (
    <div className="session-settings-page">
      <div className="session-header-top">
        <div className="header-left">
          <h2>Session Settings - Change The Settings Regarding Sessions.</h2>
          <div className="page-breadcrumb">
            <Link to="/"><Home size={14} /></Link>
            <span className="slash">/</span>
            <span>Session Settings</span>
          </div>
        </div>
      </div>

      <div className="session-content-wrapper">
        <div className="session-form-column">
          <div className="session-card">
            <div className="session-card-header">
              <h3>Session Settings</h3>
            </div>
            
            <form onSubmit={handleSubmit} className="session-form">
              <div className="form-group-input">
                <label className="group-label">User Inactivity Timeout <span>*</span></label>
                <div className="input-with-suffix">
                  <input type="number" name="userInactivityTimeout" value={settings.userInactivityTimeout} onChange={handleInputChange} required />
                  <span className="suffix">Minutes</span>
                </div>
              </div>

              <div className="form-group-input">
                <label className="group-label">Guest Timeout <span>*</span></label>
                <div className="input-with-suffix">
                  <input type="number" name="guestTimeout" value={settings.guestTimeout} onChange={handleInputChange} required />
                  <span className="suffix">Minutes</span>
                </div>
              </div>

              <div className="form-group-dropdown">
                <label className="group-label">Reset Expiry at Logon <span>*</span></label>
                <div className={`custom-select-wrapper ${isDropdownOpen ? 'open' : ''}`}>
                  <div className="custom-select-trigger" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
                    {settings.resetExpiryAtLogon}
                  </div>
                  {isDropdownOpen && (
                    <div className="custom-select-options">
                      {resetExpiryOptions.map(option => (
                        <div 
                          key={option} 
                          className={`custom-select-option ${settings.resetExpiryAtLogon === option ? 'selected' : ''}`}
                          onClick={() => handleDropdownSelect(option)}
                        >
                          {option}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-group-input">
                <label className="group-label">Cookie Expiry <span>*</span></label>
                <div className="input-with-suffix">
                  <input type="number" name="cookieExpiry" value={settings.cookieExpiry} onChange={handleInputChange} required />
                  <span className="suffix">Days</span>
                </div>
              </div>

              <div className="form-group-input">
                <label className="group-label">Cookie Path <span>*</span></label>
                <input className="path-input" type="text" name="cookiePath" value={settings.cookiePath} onChange={handleInputChange} required />
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-submit-changes">Submit</button>
              </div>
            </form>
          </div>
        </div>

        <div className="session-help-column">
          <div className="session-card help-card">
            <div className="session-card-header">
              <h3>Need Help ?</h3>
            </div>
            <div className="help-content">
              <p><strong>User Inactivity Timeout -</strong> The user is logged out after the set period of inactivity. The default PHP session timeout is usually already set at 24 minutes.</p>
              
              <p><strong>Guest Timeout -</strong> A guest is no longer considered a guest (and counted in the whose online figures) after this set period of inactivity.</p>
              
              <p><strong>Reset Expiry at Logon -</strong> When set to Yes, when a user logs on with a Remember Me cookie, his expiry date will extend by the amount set below. When set to No, he will have to re-logon after the expiry date.</p>
              
              <p><strong>Remember Me Cookie Expiry -</strong> This is the amount of days in which the remember me cookie expires.</p>
              
              <p><strong>Cookie Path -</strong> The Path attribute defines the scope of the cookie. Leave as / by default.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionSettings;
