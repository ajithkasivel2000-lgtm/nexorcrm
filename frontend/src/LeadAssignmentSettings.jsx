import { useState, useEffect } from 'react';
import { Timer, HelpCircle } from 'lucide-react';
import {
  Button, RecordCard, RecordColumn, RecordField, RecordFields, RecordGrid, RecordPage,
} from './ui';

/**
 * The one place the lead follow-up window is set.
 *
 * The timeout is deliberately not written anywhere else in the application —
 * the background sweep reads this row on every run, so a change here takes
 * effect on the next check rather than at the next deploy or restart.
 */

const HELP = [
  ['Auto Reassignment Timeout', 'How long the assigned user has to act on a new lead before it moves to the next person on the project round-robin. Applies from the moment the lead is assigned.'],
  ['Valid activity', 'Any update the assigned user makes to the lead — a status change, a call outcome, a note — stops the clock and the lead stays with them.'],
  ['Enable automatic reassignment', 'Turn this off to leave every lead where it is. Existing leads keep their owner; nothing is reassigned while it is off.'],
  ['Maximum reassignment cycles', 'A safety limit on how many times one lead may be passed along. Set 0 for no limit, which is the normal setting.'],
  ['Terminal statuses', 'A lead that is rejected, duplicate or converted stops the clock automatically — those never get reassigned, whatever this timeout says.'],
];

/** The windows worth one click. Any whole number of minutes is still accepted. */
const PRESETS = [15, 30, 45, 60];

const LeadAssignmentSettings = () => {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings/lead-assignment');
      if (response.ok) setSettings(await response.json());
    } catch (error) {
      console.error('Error fetching lead assignment settings:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // id/createdAt/updatedAt are server-managed; they are dropped, not sent back.
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...updateData } = settings;

    const minutes = Number(updateData.timeoutMinutes);
    if (!Number.isInteger(minutes) || minutes < 1) {
      window.appAlert('Timeout must be a whole number of minutes, at least 1.');
      return;
    }
    updateData.timeoutMinutes = minutes;
    updateData.maxCycles = Number(updateData.maxCycles) || 0;

    setSaving(true);
    try {
      const response = await fetch('/api/settings/lead-assignment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      if (response.ok) {
        setSettings(await response.json());
        window.appAlert('Settings updated successfully!');
      } else {
        const err = await response.json().catch(() => ({}));
        window.appAlert(err.message || 'Failed to update settings.');
      }
    } catch (error) {
      console.error('Error updating lead assignment settings:', error);
      window.appAlert('Failed to update settings.');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="nx-rec__loading">Loading…</div>;

  const set = (name) => (value) => setSettings((prev) => ({ ...prev, [name]: value }));

  return (
    <RecordPage
      crumbs={[{ label: 'Settings' }]}
      title="Lead Assignment"
      backTo="/"
      backLabel="Back to Dashboard"
    >
      <RecordGrid cols={3}>
        <RecordColumn className="nx-rec__col--wide">
          <RecordCard
            icon={Timer}
            title="Lead Auto Reassignment"
            subtitle="How long an assigned user has to respond before a lead moves to the next person on the project round-robin."
          >
            <form onSubmit={handleSubmit} className="nx-rec-form--narrow">
              <RecordFields cols={1}>
                <RecordField
                  label="Lead Auto Reassignment Timeout"
                  required
                  type="number"
                  suffix="Minutes"
                  value={settings.timeoutMinutes}
                  onChange={set('timeoutMinutes')}
                  hint={`Currently ${settings.timeoutMinutes} minutes. Applies to every project.`}
                />

                {/* The four windows asked for, as one click each. The field
                    above still takes any whole number. */}
                <div className="nx-rec-field nx-rec-fields__full">
                  <span className="nx-rec-field__label">Common windows</span>
                  <div className="nx-rec-presets">
                    {PRESETS.map((m) => (
                      <Button
                        key={m}
                        type="button"
                        size="sm"
                        variant={Number(settings.timeoutMinutes) === m ? 'primary' : 'secondary'}
                        onClick={() => set('timeoutMinutes')(m)}
                      >
                        {m} min
                      </Button>
                    ))}
                  </div>
                </div>

                <RecordField
                  label="Enable Automatic Reassignment"
                  required
                  options={['Yes', 'No']}
                  value={settings.enabled ? 'Yes' : 'No'}
                  onChange={(v) => set('enabled')(v === 'Yes')}
                  hint="Off leaves every lead with its current owner."
                />

                <RecordField
                  label="Maximum Reassignment Cycles"
                  type="number"
                  suffix="Cycles"
                  value={settings.maxCycles}
                  onChange={set('maxCycles')}
                  hint="0 means no limit — a lead keeps moving until somebody acts on it."
                />
              </RecordFields>

              <div className="nx-rec-card__actions">
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Submit'}
                </Button>
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

export default LeadAssignmentSettings;
