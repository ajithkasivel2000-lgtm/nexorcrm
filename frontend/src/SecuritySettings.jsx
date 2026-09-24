import { useState, useEffect } from 'react';
import { ShieldBan, UserX } from 'lucide-react';
import './SecuritySettings.css';
import {
  Button, RecordCard, RecordColumn, RecordField, RecordFields, RecordGrid, RecordPage,
} from './ui';

const SecuritySettings = () => {
  const [settings, setSettings] = useState(null);
  const [newUsername, setNewUsername] = useState('');
  const [newIp, setNewIp] = useState('');
  
  const [selectedUsernames, setSelectedUsernames] = useState([]);
  const [selectedIps, setSelectedIps] = useState([]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings/security');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error fetching security settings:', error);
    }
  };

  const saveSettings = async (updatedSettings) => {
    try {
      const response = await fetch('/api/settings/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings)
      });
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      } else {
        window.appAlert('Failed to update settings.');
      }
    } catch (error) {
      console.error('Error updating settings:', error);
    }
  };

  const handleAddUsername = () => {
    if (!newUsername.trim()) return;
    const updatedUsernames = [...new Set([...settings.disallowedUsernames, newUsername.trim()])];
    saveSettings({ ...settings, disallowedUsernames: updatedUsernames });
    setNewUsername('');
  };

  const handleRemoveUsernames = () => {
    if (selectedUsernames.length === 0) return;
    const updatedUsernames = settings.disallowedUsernames.filter(u => !selectedUsernames.includes(u));
    saveSettings({ ...settings, disallowedUsernames: updatedUsernames });
    setSelectedUsernames([]);
  };

  const handleAddIp = () => {
    if (!newIp.trim()) return;
    const updatedIps = [...new Set([...settings.bannedIPs, newIp.trim()])];
    saveSettings({ ...settings, bannedIPs: updatedIps });
    setNewIp('');
  };

  const handleRemoveIps = () => {
    if (selectedIps.length === 0) return;
    const updatedIps = settings.bannedIPs.filter(ip => !selectedIps.includes(ip));
    saveSettings({ ...settings, bannedIPs: updatedIps });
    setSelectedIps([]);
  };

  const handleMultiSelect = (e, setSelectionState) => {
    const options = e.target.options;
    const selected = [];
    for (let i = 0; i < options.length; i++) {
      if (options[i].selected) {
        selected.push(options[i].value);
      }
    }
    setSelectionState(selected);
  };

  if (!settings) return <div>Loading...</div>;

  return (
    <RecordPage
      crumbs={[{ label: 'Settings' }]}
      title="Security Settings"
      backTo="/"
      backLabel="Back to Dashboard"
    >
      <RecordGrid cols={2}>
        <RecordColumn>
          <RecordCard
            icon={UserX}
            title="Disallow Usernames - Prevent Usernames from being registered"
          >
            <RecordFields cols={1}>
              <RecordField
                label="Disallow Username"
                required
                placeholder="Required Field.."
                value={newUsername}
                onChange={setNewUsername}
              />
            </RecordFields>
            <div className="nx-rec-card__actions">
              <Button variant="secondary" onClick={handleAddUsername}>Add Username</Button>
            </div>

            <div className="nx-rec-field">
              <span className="nx-rec-field__label">Disallowed Usernames</span>
              <select
                multiple
                className="sec-multi-select"
                value={selectedUsernames}
                onChange={(e) => handleMultiSelect(e, setSelectedUsernames)}
              >
                {settings.disallowedUsernames.map((username, idx) => (
                  <option key={idx} value={username}>{username}</option>
                ))}
              </select>
            </div>
            <div className="nx-rec-card__actions">
              <Button variant="secondary" onClick={handleRemoveUsernames}>Remove Disallowed Usernames</Button>
            </div>
          </RecordCard>
        </RecordColumn>

        <RecordColumn>
          <RecordCard
            icon={ShieldBan}
            title="Ban IP Addresses from Registering (or logging in)"
            subtitle="Block / Ban IP"
          >
            <RecordFields cols={1}>
              <RecordField
                label="Address"
                required
                placeholder="e.g. 192.168.0.1 without leading zeros"
                value={newIp}
                onChange={setNewIp}
              />
            </RecordFields>
            <div className="nx-rec-card__actions">
              <Button variant="secondary" onClick={handleAddIp}>Add IP Address</Button>
            </div>

            <div className="nx-rec-field">
              <span className="nx-rec-field__label">Banned IP Addresses</span>
              <select
                multiple
                className="sec-multi-select"
                value={selectedIps}
                onChange={(e) => handleMultiSelect(e, setSelectedIps)}
              >
                {settings.bannedIPs.map((ip, idx) => (
                  <option key={idx} value={ip}>{ip}</option>
                ))}
              </select>
            </div>
            <div className="nx-rec-card__actions">
              <Button variant="secondary" onClick={handleRemoveIps}>Remove Banned IP Addresses</Button>
            </div>
          </RecordCard>
        </RecordColumn>
      </RecordGrid>
    </RecordPage>
  );
};

export default SecuritySettings;
