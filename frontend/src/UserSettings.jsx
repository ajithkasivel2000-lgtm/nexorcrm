import { useState, useEffect } from 'react';
import { FolderTree, HelpCircle, Users } from 'lucide-react';
import './UserSettings.css';
import {
  Button, RecordCard, RecordColumn, RecordField, RecordFields, RecordGrid,
  RecordPage, RecordRadioGroup,
} from './ui';

const YES_NO = [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }];

const SET_BY = ['By User (See User Admin page)', 'By Admin (Set below..)'];

const HELP = [
  ['Allow Multiple Logins', 'Turn on to allow multiple logins from the same account.'],
  ['Individual User Homepages', 'Turn on or off the option to set individual home pages for users, which they are directed to after logon.'],
  ['How are they Set?', 'Is the homepage set by the admin here on this page (maybe using a mixture of wildcards to make the path dynamic), or in each individual user\'s settings.'],
  ['Path', 'If the path is to be set by the admin, set it here using any wildcards available to you. Example, %username%/%username%.php which might be user1/user1.php - This example will be relative to the site root so for example the one above might be - http://www.website.com/login/user1/user1.php'],
  ['Exclude Admins', 'Redirection is disabled for Admin Accounts if set to Yes.'],
];

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
        window.appAlert('Settings updated successfully!');
      } else {
        window.appAlert('Failed to update settings.');
      }
    } catch (error) {
      console.error('Error updating settings:', error);
    }
  };

  if (!settings) return <div>Loading...</div>;

  const set = (name) => (value) => setSettings((prev) => ({ ...prev, [name]: value }));

  return (
    <RecordPage
      crumbs={[{ label: 'Settings' }]}
      title="User Settings"
      backTo="/"
      backLabel="Back to Dashboard"
    >
      <RecordGrid cols={3}>
        <RecordColumn className="nx-rec__col--wide">
          <form onSubmit={handleSubmit}>
            <RecordCard
              icon={Users}
              title="General User Settings"
              subtitle="Change global settings for user accounts."
            >
              <RecordFields cols={1}>
                <RecordRadioGroup
                  label="Allow Multiple Logins"
                  name="allowMultipleLogins"
                  options={YES_NO}
                  value={String(settings.allowMultipleLogins)}
                  onChange={handleInputChange}
                />
              </RecordFields>

              <div className="nx-rec-card__actions">
                <Button type="submit" variant="primary">Submit</Button>
              </div>
            </RecordCard>

            <RecordCard icon={FolderTree} title="Individual User Folders">
              <RecordFields cols={1}>
                <RecordRadioGroup
                  label="Individual User Homepages"
                  name="individualUserHomepages"
                  options={YES_NO}
                  value={String(settings.individualUserHomepages)}
                  onChange={handleInputChange}
                />
                <RecordRadioGroup
                  label="How are they Set?"
                  name="howAreTheySet"
                  options={SET_BY}
                  value={settings.howAreTheySet}
                  onChange={handleInputChange}
                />
                <RecordField
                  label="Path (Set by Admin)"
                  suffix="Relative to Site Root"
                  value={settings.pathSetByAdmin}
                  onChange={set('pathSetByAdmin')}
                />
                <div className="nx-rec-fields__full nx-rec-note">
                  <p>
                    The path you choose should be set relative to the admin folder (which will be
                    your Site Root, set in the General Settings page in the Control Panel).
                    Therefore you&apos;ll most likely want to go back a folder before choosing any
                    subfolder you create for the unique user pages. Use ../ to go back a folder.
                    So for example, if you site&apos;s admin control panel is here -{' '}
                    <strong>../users/</strong> then the user page might be{' '}
                    <strong>../users/admin.php</strong>
                  </p>
                  <p>
                    Wildcard available : <strong>%username%</strong> (ie, logged in user&apos;s username)
                  </p>
                </div>
                <RecordRadioGroup
                  label="Exclude Admins"
                  name="excludeAdmins"
                  options={YES_NO}
                  value={String(settings.excludeAdmins)}
                  onChange={handleInputChange}
                />
              </RecordFields>

              <div className="nx-rec-card__actions">
                <Button type="submit" variant="primary">Submit</Button>
              </div>
            </RecordCard>
          </form>
        </RecordColumn>

        <RecordColumn className="nx-rec__col--side">
          <RecordCard icon={HelpCircle} title="Need Help ?">
            {HELP.map(([term, text]) => (
              <div className="nx-rec-help" key={term}>
                <h4>{term}</h4>
                <p>{text}</p>
              </div>
            ))}
          </RecordCard>
        </RecordColumn>
      </RecordGrid>
    </RecordPage>
  );
};

export default UserSettings;
