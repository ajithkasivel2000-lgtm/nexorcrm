import { useState, useEffect } from 'react';
import { Home } from 'lucide-react';
import './SecuritySettings.css';
import { Link } from 'react-router-dom';

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
        alert('Failed to update settings.');
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
    <div className="security-settings-page">
      <div className="security-header-top">
        <div className="header-left">
          <h2>Security Settings</h2>
          <div className="page-breadcrumb">
            <Link to="/"><Home size={14} /></Link>
            <span className="slash">/</span>
            <span>Security Settings</span>
          </div>
        </div>
      </div>

      <div className="security-content-wrapper">
        
        {/* Left Card: Disallow Usernames */}
        <div className="security-card">
          <div className="security-card-header">
            <h3>Disallow Usernames - Prevent Usernames from being registered</h3>
          </div>
          <div className="security-card-body">
            
            <div className="form-group-sec">
              <label className="group-label">Disallow Username <span>*</span></label>
              <input 
                type="text" 
                className="sec-input"
                placeholder="Required Field.." 
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
              <button className="btn-sec-action" onClick={handleAddUsername}>
                Add Username
              </button>
            </div>

            <div className="form-group-sec">
              <label className="group-label">Disallowed Usernames</label>
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
              <button className="btn-sec-action" onClick={handleRemoveUsernames}>
                Remove Disallowed Usernames
              </button>
            </div>

          </div>
        </div>

        {/* Right Card: Ban IP Addresses */}
        <div className="security-card">
          <div className="security-card-header">
            <h3>Ban IP Addresses from Registering (or logging in)</h3>
            <p className="subtitle">Block / Ban IP</p>
          </div>
          <div className="security-card-body">
            
            <div className="form-group-sec">
              <label className="group-label">Address <span>*</span></label>
              <input 
                type="text" 
                className="sec-input"
                placeholder="e.g. 192.168.0.1 without leading zeros" 
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
              />
              <button className="btn-sec-action" onClick={handleAddIp}>
                Add IP Address
              </button>
            </div>

            <div className="form-group-sec">
              <label className="group-label">Banned IP Addresses</label>
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
              <button className="btn-sec-action" onClick={handleRemoveIps}>
                Remove Banned IP Addresses
              </button>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};

export default SecuritySettings;
