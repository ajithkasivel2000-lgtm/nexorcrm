import { useState, useEffect } from 'react';
import { HelpCircle, UserPlus } from 'lucide-react';
import './RegistrationSettings.css';
import {
  Button, RecordCard, RecordColumn, RecordField, RecordFields, RecordGrid,
  RecordPage, RecordRadioGroup, RecordRange,
} from './ui';

const ACTIVATION_OPTIONS = [
  'Disable Registration',
  'No Activation (immediate access)',
  'User Activation (e-mail verification)',
  'Admin Activation',
];

const YES_NO = [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }];

const HELP = [
  ['Account Activation', 'User Activation requires the new user to activate their account by clicking a link sent to their e-mail address. Admin Activation requires an admin to activate the account using the control panel or by a link sent to their e-mail address.'],
  ['Limit Username Characters', 'Limit the characters allowed in new username registrations.'],
  ['Username Length', 'Minimum and maximum username length.'],
  ['Password Length', 'Minimum and maximum password length.'],
  ['Send Welcome E-mail', 'Whether or not to send a welcome e-mail to all new users upon registration.'],
  ['Enable Captcha', 'Do I want this?.'],
  ['Username Lowercase', 'When set to yes, all registered usernames are made lowercase.'],
];

const RegistrationSettings = () => {
  const [settings, setSettings] = useState(null);

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
    const { name, value, type } = e.target;
    
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/settings/registration', {
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
      title="Registration Settings"
      backTo="/"
      backLabel="Back to Dashboard"
    >
      <RecordGrid cols={3}>
        <RecordColumn className="nx-rec__col--wide">
          <RecordCard
            icon={UserPlus}
            title="Registration Settings - Change The Settings Regarding Registration To The Site."
          >
            <form onSubmit={handleSubmit}>
              <RecordFields cols={1}>
                <RecordRadioGroup
                  label="Account Activation"
                  name="accountActivation"
                  options={ACTIVATION_OPTIONS}
                  value={settings.accountActivation}
                  onChange={handleInputChange}
                />
                <RecordField
                  label="Limit Username Characters"
                  options={characterOptions}
                  value={settings.limitUsernameCharacters}
                  onChange={set('limitUsernameCharacters')}
                />
                <RecordRange
                  label="Username Length"
                  required
                  min={settings.usernameLengthMin}
                  max={settings.usernameLengthMax}
                  onMinChange={(e) => set('usernameLengthMin')(e.target.value)}
                  onMaxChange={(e) => set('usernameLengthMax')(e.target.value)}
                />
                <RecordRange
                  label="Password Length"
                  required
                  min={settings.passwordLengthMin}
                  max={settings.passwordLengthMax}
                  onMinChange={(e) => set('passwordLengthMin')(e.target.value)}
                  onMaxChange={(e) => set('passwordLengthMax')(e.target.value)}
                />
                <RecordRadioGroup
                  label="Send Welcome E-mail"
                  name="sendWelcomeEmail"
                  options={YES_NO}
                  value={String(settings.sendWelcomeEmail)}
                  onChange={handleInputChange}
                />
                <RecordRadioGroup
                  label="Enable Captcha"
                  name="enableCaptcha"
                  options={YES_NO}
                  value={String(settings.enableCaptcha)}
                  onChange={handleInputChange}
                />
                <RecordRadioGroup
                  label="Username Lowercase"
                  name="usernameLowercase"
                  options={YES_NO}
                  value={String(settings.usernameLowercase)}
                  onChange={handleInputChange}
                />
              </RecordFields>

              <div className="nx-rec-card__actions">
                <Button type="submit" variant="primary">Submit Changes</Button>
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

export default RegistrationSettings;
