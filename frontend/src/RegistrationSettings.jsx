import { useState, useEffect } from 'react';
import { Home } from 'lucide-react';
import './RegistrationSettings.css';
import { Link } from 'react-router-dom';

const RegistrationSettings = () => {
  const [settings, setSettings] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const characterOptions = [
    'Any Chars',
    'Alphanumeric Only',
    'Alphanumeric Spacers',
    'Any Letter Num',
    'Letter Num and Spaces'
  ];

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings/registration');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error fetching registration settings:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    let parsedValue = value;
    if (type === 'number') {
      parsedValue = parseInt(value, 10);
    } else if (value === 'true' || value === 'false') {
      parsedValue = value === 'true';
    }

    setSettings(prev => ({
      ...prev,
      [name]: parsedValue
    }));
  };

  const handleDropdownSelect = (option) => {
    setSettings(prev => ({
      ...prev,
      limitUsernameCharacters: option
    }));
    setIsDropdownOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/settings/registration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
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
    <div className="registration-settings-page">
      <div className="reg-header-top">
        <div className="header-left">
          <h2>Registration Settings - Change The Settings Regarding Registration To The Site.</h2>
          <div className="page-breadcrumb">
            <Link to="/"><Home size={14} /></Link>
            <span className="slash">/</span>
            <span>Registration Settings</span>
          </div>
        </div>
      </div>

      <div className="reg-content-wrapper">
        <div className="reg-form-column">
          <div className="reg-card">
            <div className="reg-card-header">
              <h3>Registration Settings</h3>
            </div>
            
            <form onSubmit={handleSubmit} className="reg-form">
              <div className="form-group-radio">
                <label className="group-label">Account Activation</label>
                <div className="radio-options">
                  <label className="custom-radio">
                    <input type="radio" name="accountActivation" value="Disable Registration" checked={settings.accountActivation === 'Disable Registration'} onChange={handleInputChange} />
                    <span className="radio-mark"></span>
                    Disable Registration
                  </label>
                  <label className="custom-radio">
                    <input type="radio" name="accountActivation" value="No Activation (immediate access)" checked={settings.accountActivation === 'No Activation (immediate access)'} onChange={handleInputChange} />
                    <span className="radio-mark"></span>
                    No Activation (immediate access)
                  </label>
                  <label className="custom-radio">
                    <input type="radio" name="accountActivation" value="User Activation (e-mail verification)" checked={settings.accountActivation === 'User Activation (e-mail verification)'} onChange={handleInputChange} />
                    <span className="radio-mark"></span>
                    User Activation (e-mail verification)
                  </label>
                  <label className="custom-radio">
                    <input type="radio" name="accountActivation" value="Admin Activation" checked={settings.accountActivation === 'Admin Activation'} onChange={handleInputChange} />
                    <span className="radio-mark"></span>
                    Admin Activation
                  </label>
                </div>
              </div>

              <div className="form-group-dropdown">
                <label className="group-label">Limit Username Characters</label>
                <div className={`custom-select-wrapper ${isDropdownOpen ? 'open' : ''}`}>
                  <div className="custom-select-trigger" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
                    {settings.limitUsernameCharacters}
                  </div>
                  {isDropdownOpen && (
                    <div className="custom-select-options">
                      {characterOptions.map(option => (
                        <div 
                          key={option} 
                          className={`custom-select-option ${settings.limitUsernameCharacters === option ? 'selected' : ''}`}
                          onClick={() => handleDropdownSelect(option)}
                        >
                          {option}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-group-range">
                <label className="group-label">Username Length <span>*</span></label>
                <div className="range-inputs">
                  <input type="number" name="usernameLengthMin" value={settings.usernameLengthMin} onChange={handleInputChange} required />
                  <span className="to-text">to</span>
                  <input type="number" name="usernameLengthMax" value={settings.usernameLengthMax} onChange={handleInputChange} required />
                </div>
              </div>

              <div className="form-group-range">
                <label className="group-label">Password Length <span>*</span></label>
                <div className="range-inputs">
                  <input type="number" name="passwordLengthMin" value={settings.passwordLengthMin} onChange={handleInputChange} required />
                  <span className="to-text">to</span>
                  <input type="number" name="passwordLengthMax" value={settings.passwordLengthMax} onChange={handleInputChange} required />
                </div>
              </div>

              <div className="form-group-radio">
                <label className="group-label">Send Welcome E-mail</label>
                <div className="radio-options inline">
                  <label className="custom-radio">
                    <input type="radio" name="sendWelcomeEmail" value="true" checked={settings.sendWelcomeEmail === true} onChange={handleInputChange} />
                    <span className="radio-mark"></span> Yes
                  </label>
                  <label className="custom-radio">
                    <input type="radio" name="sendWelcomeEmail" value="false" checked={settings.sendWelcomeEmail === false} onChange={handleInputChange} />
                    <span className="radio-mark"></span> No
                  </label>
                </div>
              </div>

              <div className="form-group-radio">
                <label className="group-label">Enable Captcha</label>
                <div className="radio-options inline">
                  <label className="custom-radio">
                    <input type="radio" name="enableCaptcha" value="true" checked={settings.enableCaptcha === true} onChange={handleInputChange} />
                    <span className="radio-mark"></span> Yes
                  </label>
                  <label className="custom-radio">
                    <input type="radio" name="enableCaptcha" value="false" checked={settings.enableCaptcha === false} onChange={handleInputChange} />
                    <span className="radio-mark"></span> No
                  </label>
                </div>
              </div>

              <div className="form-group-radio">
                <label className="group-label">Username Lowercase</label>
                <div className="radio-options inline">
                  <label className="custom-radio">
                    <input type="radio" name="usernameLowercase" value="true" checked={settings.usernameLowercase === true} onChange={handleInputChange} />
                    <span className="radio-mark"></span> Yes
                  </label>
                  <label className="custom-radio">
                    <input type="radio" name="usernameLowercase" value="false" checked={settings.usernameLowercase === false} onChange={handleInputChange} />
                    <span className="radio-mark"></span> No
                  </label>
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-submit-changes">Submit Changes</button>
              </div>
            </form>
          </div>
        </div>

        <div className="reg-help-column">
          <div className="reg-card help-card">
            <div className="reg-card-header">
              <h3>Need Help ?</h3>
            </div>
            <div className="help-content">
              <p><strong>Account Activation -</strong> User Activation requires the new user to activate their account by clicking a link sent to their e-mail address. Admin Activation requires an admin to activate the account using the control panel or by a link sent to their e-mail address.</p>
              
              <p><strong>Limit Username Characters -</strong> Limit the characters allowed in new username registrations.</p>
              
              <p><strong>Username Length -</strong> Minimum and maximum username length.</p>
              
              <p><strong>Password Length -</strong> Minimum and maximum password length.</p>
              
              <p><strong>Send Welcome E-mail -</strong> Whether or not to send a welcome e-mail to all new users upon registration.</p>
              
              <p><strong>Enable Captcha -</strong> Do I want this?.</p>
              
              <p><strong>Username Lowercase -</strong> When set to yes, all registered usernames are made lowercase.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegistrationSettings;
