import { useState, useEffect } from 'react';
import { Save, Send } from 'lucide-react';
import './MailSettings.css';
import submitOnEnter from './utils/submitOnEnter';
import { Button, EmailInput, RecordPage, RecordPasswordField, Select, emailError, isValidEmail, normalizeEmail } from './ui';

const defaultSettings = {
  smtpHost: '',
  smtpPort: 587,
  smtpUsername: '',
  smtpPassword: '',
  fromEmail: '',
  fromName: '',
  smtpAuth: 'True',
  starttls: 'True',
  defaultCC: '',
  defaultBCC: '',
  enabled: true
};

const MailSettings = () => {
  const [settings, setSettings] = useState(defaultSettings);
  const [testEmail, setTestEmail] = useState('');
  const [ccInput, setCcInput] = useState('');
  const [bccInput, setBccInput] = useState('');
  const [ccEmails, setCcEmails] = useState([]);
  const [bccEmails, setBccEmails] = useState([]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings/mail');
      if (response.ok) {
        const data = await response.json();
        setSettings({
          ...defaultSettings,
          ...data,
          smtpAuth: data.smtpAuth || 'True',
          starttls: data.starttls || 'True'
        });
        // Initialize email lists from comma-separated strings
        if (data.defaultCC) {
          setCcEmails(data.defaultCC.split(',').map(e => e.trim()).filter(Boolean));
        }
        if (data.defaultBCC) {
          setBccEmails(data.defaultBCC.split(',').map(e => e.trim()).filter(Boolean));
        }
      }
    } catch (error) {
      console.error('Error fetching mail settings:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    let parsedValue = value;
    if (type === 'number') {
      parsedValue = parseInt(value, 10);
      if (isNaN(parsedValue)) parsedValue = '';
    }
    setSettings(prev => ({
      ...prev,
      [name]: parsedValue
    }));
  };

  const handleToggleEnabled = () => {
    setSettings(prev => ({
      ...prev,
      enabled: !prev.enabled
    }));
  };

  const addEmail = (list, setList, input, setInput, fieldName) => {
    const email = normalizeEmail(input);
    if (!email) return;
    if (!isValidEmail(email)) {
      window.appAlert(`Please enter a valid email address for ${fieldName}.`);
      return;
    }
    if (list.includes(email)) {
      window.appAlert(`Email "${email}" is already in the ${fieldName} list.`);
      return;
    }
    setList([...list, email]);
    setInput('');
  };

  const removeEmail = (list, setList, email) => {
    setList(list.filter(e => e !== email));
  };

  const handleKeyDown = (e, list, setList, input, setInput, fieldName) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addEmail(list, setList, input, setInput, fieldName);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const badFrom = emailError(settings.fromEmail, { label: 'From email address' });
    if (badFrom) { window.appAlert(badFrom); return; }
    // Convert email lists to comma-separated strings for backend
    const settingsToSave = {
      ...settings,
      defaultCC: ccEmails.join(', '),
      defaultBCC: bccEmails.join(', ')
    };
    try {
      const response = await fetch('/api/settings/mail', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsToSave)
      });
      if (response.ok) {
        window.appAlert('Mail settings updated successfully!');
      } else {
        window.appAlert('Failed to update mail settings.');
      }
    } catch (error) {
      console.error('Error updating mail settings:', error);
    }
  };

  const handleTestEmail = async () => {
    const badRecipient = emailError(testEmail, { required: true, label: 'Recipient email address' });
    if (badRecipient) { window.appAlert(badRecipient); return; }

    if (!settings.fromEmail) {
      window.appAlert('Please configure a From Email Address in the SMTP settings first.');
      return;
    }

    // First save the current settings including email lists before testing
    const settingsToSave = {
      ...settings,
      defaultCC: ccEmails.join(', '),
      defaultBCC: bccEmails.join(', ')
    };
    try {
      const saveResponse = await fetch('/api/settings/mail', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsToSave)
      });
      
      if (!saveResponse.ok) {
        window.appAlert('Failed to save mail settings before test.');
        return;
      }
    } catch (error) {
      console.error('Error saving mail settings:', error);
      window.appAlert('Failed to save mail settings before test.');
      return;
    }
    
    try {
      const response = await fetch('/api/settings/mail/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail: testEmail })
      });
      
      if (response.ok) {
        window.appAlert(`✓ Test email sent successfully to ${testEmail}!`);
      } else {
        const errorData = await response.json();
        window.appAlert(`✗ Failed to send test email: ${errorData.error || errorData.message}`);
      }
    } catch (error) {
      console.error('Error sending test email:', error);
      window.appAlert('Failed to send test email. Please check the console for details.');
    }
  };

  return (
    <RecordPage
      crumbs={[{ label: 'Settings' }]}
      title="Email Settings"
      backTo="/"
      backLabel="Back to Dashboard"
      actions={(
        <Button variant="primary" onClick={handleSubmit}>
          <Save size={16} /> Save Settings
        </Button>
      )}
    >
      <div className="mail-content-area">
        {/* SMTP Configuration Card */}
        <div className="mail-card nx-rec-card">
          <div className="mail-card-header nx-rec-card__head nx-rec-card__head--plain">
            <h3>SMTP Server Configuration</h3>
            <p className="mail-card-subtitle">Configure the SMTP server settings used by the system to dispatch notifications and emails.</p>
          </div>
          
          <div className="mail-form nx-rec-card__body">
            {/* Row 1 */}
            <div className="mail-row">
              <div className="mail-col w-20">
                <div className="mail-field-group">
                  <label className="mail-field-label">Enabled</label>
                  <div className="mail-toggle-wrapper">
                    <label className="mail-toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.enabled}
                        onChange={handleToggleEnabled}
                      />
                      <span className="mail-toggle-slider"></span>
                    </label>
                    <span className="mail-toggle-label">Send emails</span>
                  </div>
                </div>
              </div>
              <div className="mail-col w-50">
                <div className="mail-field-group">
                  <label className="mail-field-label">SMTP Host</label>
                  <input
                    type="text"
                    className="mail-field-input"
                    name="smtpHost"
                    value={settings.smtpHost}
                    onChange={handleInputChange}
                    onKeyDown={submitOnEnter(handleSubmit)}
                    placeholder="smtp.gmail.com"
                  />
                </div>
              </div>
              <div className="mail-col w-30">
                <div className="mail-field-group">
                  <label className="mail-field-label">Port</label>
                  <input
                    type="number"
                    className="mail-field-input"
                    name="smtpPort"
                    value={settings.smtpPort}
                    onChange={handleInputChange}
                    onKeyDown={submitOnEnter(handleSubmit)}
                    placeholder="587"
                  />
                </div>
              </div>
            </div>

            {/* Row 2 */}
            <div className="mail-row">
              <div className="mail-col w-50">
                <div className="mail-field-group">
                  <label className="mail-field-label">Username</label>
                  <input
                    type="text"
                    className="mail-field-input"
                    name="smtpUsername"
                    value={settings.smtpUsername}
                    onChange={handleInputChange}
                    onKeyDown={submitOnEnter(handleSubmit)}
                    placeholder="you@yourcompany.com"
                  />
                </div>
              </div>
              <div className="mail-col w-50">
                <div className="mail-field-group">
                  <RecordPasswordField
                    label="Password"
                    name="smtpPassword"
                    value={settings.smtpPassword}
                    onChange={handleInputChange}
                    placeholder="******** (enter to change)"
                    hint="Password is set. Leave blank to keep existing."
                  />
                </div>
              </div>
            </div>

            {/* Row 3 */}
            <div className="mail-row">
              <div className="mail-col w-50">
                <div className="mail-field-group">
                  <label className="mail-field-label">SMTP Auth</label>
                  <Select
                    name="smtpAuth"
                    value={settings.smtpAuth}
                    onChange={handleInputChange}
                  >
                    <option value="True">True</option>
                    <option value="False">False</option>
                  </Select>
                </div>
              </div>
              <div className="mail-col w-50">
                <div className="mail-field-group">
                  <label className="mail-field-label">STARTTLS</label>
                  <Select
                    name="starttls"
                    value={settings.starttls}
                    onChange={handleInputChange}
                  >
                    <option value="True">True</option>
                    <option value="False">False</option>
                  </Select>
                </div>
              </div>
            </div>

            {/* Row 4 */}
            <div className="mail-row">
              <div className="mail-col w-50">
                <div className="mail-field-group">
                  <label className="mail-field-label">From Email Address</label>
                  <EmailInput
                    name="fromEmail"
                    label="From email address"
                    value={settings.fromEmail}
                    onChange={(v) => setSettings(prev => ({ ...prev, fromEmail: v }))}
                    placeholder="you@yourcompany.com"
                  />
                </div>
              </div>
              <div className="mail-col w-50">
                <div className="mail-field-group">
                  <label className="mail-field-label">From Sender Name</label>
                  <input
                    type="text"
                    className="mail-field-input"
                    name="fromName"
                    value={settings.fromName}
                    onChange={handleInputChange}
                    onKeyDown={submitOnEnter(handleSubmit)}
                    placeholder="NexorCRM"
                  />
                </div>
              </div>
            </div>

            {/* Row 5 - CC & BCC Recipients */}
            <div className="mail-row">
              <div className="mail-col w-50">
                <div className="mail-field-group">
                  <label className="mail-field-label">Default CC Recipients</label>
                  <div className="mail-input-with-btn">
                    <input
                      type="text"
                      className="mail-field-input"
                      value={ccInput}
                      onChange={(e) => setCcInput(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, ccEmails, setCcEmails, ccInput, setCcInput, 'Default CC')}
                      placeholder="Enter email and press Enter or Add"
                    />
                    <button className="mail-btn-add" type="button" onClick={() => addEmail(ccEmails, setCcEmails, ccInput, setCcInput, 'Default CC')}>Add</button>
                  </div>
                  {ccEmails.length > 0 && (
                    <div className="mail-email-tags">
                      {ccEmails.map((email, idx) => (
                        <span key={idx} className="mail-email-tag">
                          {email}
                          <button type="button" className="mail-tag-remove" onClick={() => removeEmail(ccEmails, setCcEmails, email)}>&times;</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="mail-col w-50">
                <div className="mail-field-group">
                  <label className="mail-field-label">Default BCC Recipients</label>
                  <div className="mail-input-with-btn">
                    <input
                      type="text"
                      className="mail-field-input"
                      value={bccInput}
                      onChange={(e) => setBccInput(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, bccEmails, setBccEmails, bccInput, setBccInput, 'Default BCC')}
                      placeholder="Enter email and press Enter or Add"
                    />
                    <button className="mail-btn-add" type="button" onClick={() => addEmail(bccEmails, setBccEmails, bccInput, setBccInput, 'Default BCC')}>Add</button>
                  </div>
                  {bccEmails.length > 0 && (
                    <div className="mail-email-tags">
                      {bccEmails.map((email, idx) => (
                        <span key={idx} className="mail-email-tag">
                          {email}
                          <button type="button" className="mail-tag-remove" onClick={() => removeEmail(bccEmails, setBccEmails, email)}>&times;</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
          </div>
        </div>

        {/* Test Connection Card */}
        <div className="mail-card nx-rec-card">
          <div className="mail-card-header nx-rec-card__head nx-rec-card__head--plain">
            <h3>Test Connection</h3>
            <p className="mail-card-subtitle">Verify your configuration settings by sending a test email to any recipient.</p>
          </div>
          <div className="mail-form nx-rec-card__body">
            <div className="mail-row align-bottom">
              <div className="mail-col w-70">
                <div className="mail-field-group">
                  <label className="mail-field-label">Recipient Email Address</label>
                  <EmailInput
                    name="testEmail"
                    label="Recipient email address"
                    value={testEmail}
                    onChange={setTestEmail}
                    placeholder="test-recipient@example.com"
                  />
                </div>
              </div>
              <div className="mail-col w-30">
                <button type="button" className="mail-btn-test" onClick={handleTestEmail}>
                  <Send size={16} /> Send Test Email
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </RecordPage>
  );
};

export default MailSettings;
