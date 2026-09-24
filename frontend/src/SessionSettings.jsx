import { useState, useEffect } from 'react';
import { Clock, HelpCircle } from 'lucide-react';
import './SessionSettings.css';
import {
  Button, RecordCard, RecordColumn, RecordField, RecordFields, RecordGrid, RecordPage,
} from './ui';

const HELP = [
  ['User Inactivity Timeout', 'The user is logged out after the set period of inactivity. The default PHP session timeout is usually already set at 24 minutes.'],
  ['Guest Timeout', 'A guest is no longer considered a guest (and counted in the whose online figures) after this set period of inactivity.'],
  ['Reset Expiry at Logon', 'When set to Yes, when a user logs on with a Remember Me cookie, his expiry date will extend by the amount set below. When set to No, he will have to re-logon after the expiry date.'],
  ['Remember Me Cookie Expiry', 'This is the amount of days in which the remember me cookie expires.'],
  ['Cookie Path', 'The Path attribute defines the scope of the cookie. Leave as / by default.'],
];

const SessionSettings = () => {
  const [settings, setSettings] = useState(null);

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

  const handleSubmit = async (e) => {
    e.preventDefault();

    // createdAt/updatedAt are server-managed; they are dropped, not sent back.
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...updateData } = settings;

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
      title="Session Settings"
      backTo="/"
      backLabel="Back to Dashboard"
    >
      <RecordGrid cols={3}>
        <RecordColumn className="nx-rec__col--wide">
          <RecordCard
            icon={Clock}
            title="Session Settings"
            subtitle="Change the settings regarding sessions."
          >
            <form onSubmit={handleSubmit}>
              <RecordFields cols={1}>
                <RecordField
                  label="User Inactivity Timeout"
                  required
                  type="number"
                  suffix="Minutes"
                  value={settings.userInactivityTimeout}
                  onChange={set('userInactivityTimeout')}
                />
                <RecordField
                  label="Guest Timeout"
                  required
                  type="number"
                  suffix="Minutes"
                  value={settings.guestTimeout}
                  onChange={set('guestTimeout')}
                />
                <RecordField
                  label="Reset Expiry at Logon"
                  required
                  options={resetExpiryOptions}
                  value={settings.resetExpiryAtLogon}
                  onChange={set('resetExpiryAtLogon')}
                />
                <RecordField
                  label="Cookie Expiry"
                  required
                  type="number"
                  suffix="Days"
                  value={settings.cookieExpiry}
                  onChange={set('cookieExpiry')}
                />
                <RecordField
                  label="Cookie Path"
                  required
                  value={settings.cookiePath}
                  onChange={set('cookiePath')}
                />
              </RecordFields>

              <div className="nx-rec-card__actions">
                <Button type="submit" variant="primary">Submit</Button>
              </div>
            </form>
          </RecordCard>
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

export default SessionSettings;
