import { useState, useEffect } from 'react';
import { Home } from 'lucide-react';
import './UserSettings.css';
import { Link } from 'react-router-dom';

const UserSettings = () => {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings/user');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error fetching global user settings:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    
    let parsedValue = value;
    if (type === 'radio' && (value === 'true' || value === 'false')) {
      parsedValue = value === 'true';
    }

    setSettings(prev => ({
      ...prev,
      [name]: parsedValue
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/settings/user', {
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
    <div className="user-settings-page">
      <div className="user-header-top">
        <div className="header-left">
          <h2>User Settings - Change Global Settings For User Accounts.</h2>
          <div className="page-breadcrumb">
            <Link to="/"><Home size={14} /></Link>
            <span className="slash">/</span>
            <span>User Settings</span>
          </div>
        </div>
      </div>

      <div className="user-content-wrapper">
        <div className="user-form-column">
          
          <div className="user-card">
            <div className="user-card-header">
              <h3>General User Settings</h3>
            </div>
            <form onSubmit={handleSubmit} className="user-form">
              <div className="form-group-radio">
                <label className="group-label">Allow Multiple Logins</label>
                <div className="radio-options inline">
                  <label className="custom-radio">
                    <input type="radio" name="allowMultipleLogins" value="true" checked={settings.allowMultipleLogins === true} onChange={handleInputChange} />
                    <span className="radio-mark"></span> Yes
                  </label>
                  <label className="custom-radio">
                    <input type="radio" name="allowMultipleLogins" value="false" checked={settings.allowMultipleLogins === false} onChange={handleInputChange} />
                    <span className="radio-mark"></span> No
                  </label>
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-submit-purple">Submit</button>
              </div>
            </form>
          </div>

          <div className="user-card">
            <div className="user-card-header">
              <h3>Individual User Folders</h3>
            </div>
            <form onSubmit={handleSubmit} className="user-form">
              <div className="form-group-radio">
                <label className="group-label">Individual User Homepages</label>
                <div className="radio-options inline">
                  <label className="custom-radio">
                    <input type="radio" name="individualUserHomepages" value="true" checked={settings.individualUserHomepages === true} onChange={handleInputChange} />
                    <span className="radio-mark"></span> Yes
                  </label>
                  <label className="custom-radio">
                    <input type="radio" name="individualUserHomepages" value="false" checked={settings.individualUserHomepages === false} onChange={handleInputChange} />
                    <span className="radio-mark"></span> No
                  </label>
                </div>
              </div>

              <div className="form-group-radio">
                <label className="group-label">How are they Set?</label>
                <div className="radio-options inline">
                  <label className="custom-radio">
                    <input type="radio" name="howAreTheySet" value="By User (See User Admin page)" checked={settings.howAreTheySet === 'By User (See User Admin page)'} onChange={handleInputChange} />
                    <span className="radio-mark"></span> By User (See User Admin page)
                  </label>
                  <label className="custom-radio">
                    <input type="radio" name="howAreTheySet" value="By Admin (Set below..)" checked={settings.howAreTheySet === 'By Admin (Set below..)'} onChange={handleInputChange} />
                    <span className="radio-mark"></span> By Admin (Set below..)
                  </label>
                </div>
              </div>

              <div className="form-group-input">
                <label className="group-label">Path (Set by Admin)</label>
                <div className="input-with-suffix">
                  <input type="text" name="pathSetByAdmin" value={settings.pathSetByAdmin} onChange={handleInputChange} />
                  <span className="suffix">Relative to Site Root</span>
                </div>
                <div className="path-help-text">
                  <p>The path you choose should be set relative to the admin folder (which will be your Site Root, set in the General Settings page in the Control Panel). Therefore you'll most likely want to go back a folder before choosing any subfolder you create for the unique user pages. Use ../ to go back a folder. So for example, if you site's admin control panel is here - <em>http://www.website.com/admin/</em> and your user folders are here - <em>http://www.website.com/users/</em> you'll want to set the path setting to <strong>../users/</strong> along with your unique page - so <strong>../users/admin.php</strong>.</p>
                  <p>Wildcard available : <strong>%username%</strong> (ie, logged in user's username)</p>
                </div>
              </div>

              <div className="form-group-radio">
                <label className="group-label">Exclude Admins</label>
                <div className="radio-options inline">
                  <label className="custom-radio">
                    <input type="radio" name="excludeAdmins" value="true" checked={settings.excludeAdmins === true} onChange={handleInputChange} />
                    <span className="radio-mark"></span> Yes
                  </label>
                  <label className="custom-radio">
                    <input type="radio" name="excludeAdmins" value="false" checked={settings.excludeAdmins === false} onChange={handleInputChange} />
                    <span className="radio-mark"></span> No
                  </label>
                </div>
                <p className="exclude-help-text">Exclude Admins from being redirected.</p>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-submit-purple">Submit</button>
              </div>
            </form>
          </div>

        </div>

        <div className="user-help-column">
          <div className="user-card help-card">
            <div className="user-card-header">
              <h3>Need Help ?</h3>
            </div>
            <div className="help-content">
              <p><strong>Allow Multiple Logins -</strong> Turn on to allow multiple logins from the same account.</p>
              
              <p><strong>Individual User Homepages -</strong> Turn on or off the option to set individual home pages for users, which they are directed to after logon.</p>
              
              <p><strong>How are they Set? -</strong> Is the homepage set by the admin here on this page (maybe using a mixture of wildcards to make the path dynamic), or in each individual user's settings.</p>
              
              <p><strong>Path -</strong> If the path is to be set by the admin, set it here using any wildcards available to you. Example, %username%/%username%.php which might be user1/user1.php - This example will be relative to the site root so for example the one above might be - <strong>http://www.website.com/login/user1/user1.php</strong></p>
              
              <p><strong>Exclude Admins -</strong> Redirection is disabled for Admin Accounts if set to Yes.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserSettings;
