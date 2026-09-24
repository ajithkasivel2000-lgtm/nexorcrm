import { useState, useEffect } from 'react';
import { BellRing, HelpCircle } from 'lucide-react';
import {
  Button, RecordCard, RecordColumn, RecordField, RecordFields, RecordGrid, RecordPage,
} from './ui';

/**
 * The one place every reminder timing is set, for every module.
 *
 * Nothing here is written into the code anywhere: the background sweep reads
 * this row on each tick, so a change takes effect on the next check rather than
 * at the next deploy. The same row governs lead follow-ups, opportunity
 * follow-ups, tasks, calls, meetings and site visits — there is no per-module
 * reminder setting to keep in step with this one.
 */

const HELP = [
  ['Remind before', 'How far ahead of the due time the first reminder goes out. The default is 3 hours, so a 6:00pm follow-up starts reminding at 3:00pm.'],
  ['Repeat every', 'How often it reminds after that, up to the due time. At 30 minutes a 6:00pm follow-up reminds at 3:00, 3:30, 4:00, 4:30, 5:00 and 5:30.'],
  ['Maximum reminders', 'A cap per activity, so a long window cannot become a stream. 0 means no cap — the series simply runs to the due time.'],
  ['Overdue reminders', 'Keep reminding after the due time has passed, on their own interval. Turn this off to stop at the due time.'],
  ['Escalate after', 'How long past due before the owner’s reporting manager is told as well — and the administrators, if nobody is named as their manager. 0 never escalates.'],
  ['What stops a reminder', 'Completing, cancelling or converting the activity. Nothing is scheduled in advance, so a finished activity is simply never found again. Rescheduling starts a fresh series from the new time.'],
  ['Channels', 'The bell always works. Push needs the browser to have notifications turned on for this site.'],
];

/** The lead times worth one click. The field still takes any whole number. */
const BEFORE_PRESETS = [60, 120, 180, 360];
/** The repeat intervals worth one click. */
const REPEAT_PRESETS = [15, 30, 60];

const ReminderSettings = () => {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings/reminders');
      if (response.ok) setSettings(await response.json());
    } catch (error) {
      console.error('Error fetching reminder settings:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // id/createdAt/updatedAt are server-managed; dropped rather than sent back.
    const { id: _id, createdAt: _c, updatedAt: _u, ...updateData } = settings;

    const whole = (value) => Number(value);
    updateData.leadMinutes = whole(updateData.leadMinutes);
    updateData.repeatMinutes = whole(updateData.repeatMinutes);
    updateData.maxReminders = whole(updateData.maxReminders) || 0;
    updateData.overdueRepeatMinutes = whole(updateData.overdueRepeatMinutes);
    updateData.escalateAfterMinutes = whole(updateData.escalateAfterMinutes) || 0;

    if (!Number.isInteger(updateData.leadMinutes) || updateData.leadMinutes < 1) {
      window.appAlert('Remind before must be a whole number of minutes, at least 1.');
      return;
    }
    if (!Number.isInteger(updateData.repeatMinutes) || updateData.repeatMinutes < 1) {
      window.appAlert('Repeat every must be a whole number of minutes, at least 1.');
      return;
    }
    /* Caught here as well as on the server so the reason is on screen before
       the round trip: a repeat longer than the lead time sends one reminder
       and then nothing, which almost always means a typo. */
    if (updateData.repeatMinutes > updateData.leadMinutes) {
      window.appAlert('The repeat interval cannot be longer than the remind-before time — that would send one reminder and no more.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/settings/reminders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      if (response.ok) {
        setSettings(await response.json());
        window.appAlert('Reminder settings updated.');
      } else {
        const err = await response.json().catch(() => ({}));
        window.appAlert(err.message || 'Failed to update reminder settings.');
      }
    } catch (error) {
      console.error('Error updating reminder settings:', error);
      window.appAlert('Failed to update reminder settings.');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="nx-rec__loading">Loading…</div>;

  const set = (name) => (value) => setSettings((prev) => ({ ...prev, [name]: value }));

  /* The series spelled out from the current numbers, so the effect of a change
     is visible before it is saved rather than only at 3am when it fires. */
  const preview = (() => {
    const lead = Number(settings.leadMinutes);
    const step = Number(settings.repeatMinutes);
    if (!lead || !step || step > lead) return null;
    const slots = [];
    for (let m = lead; m > 0 && slots.length < 8; m -= step) slots.push(m);
    const cap = Number(settings.maxReminders) || 0;
    const shown = cap > 0 ? slots.slice(0, cap) : slots;
    const asTime = (mins) => {
      const d = new Date(Date.now() + (lead - mins) * 60000);
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    };
    return `${shown.length} reminder${shown.length === 1 ? '' : 's'}: `
      + shown.map(asTime).join(', ')
      + (cap === 0 && slots.length >= 8 ? ' …' : '');
  })();

  return (
    <RecordPage
      crumbs={[{ label: 'Settings' }]}
      title="Reminders"
      backTo="/"
      backLabel="Back to Dashboard"
    >
      <RecordGrid cols={3}>
        <RecordColumn className="nx-rec__col--wide">
          <RecordCard
            icon={BellRing}
            title="Activity Reminders"
            subtitle="One set of timings for every dated activity in the CRM — lead and opportunity follow-ups, tasks, calls, meetings and site visits."
          >
            <form onSubmit={handleSubmit} className="nx-rec-form--narrow">
              <RecordFields cols={1}>
                <RecordField
                  label="Enable Reminders"
                  required
                  options={['Yes', 'No']}
                  value={settings.enabled ? 'Yes' : 'No'}
                  onChange={(v) => set('enabled')(v === 'Yes')}
                  hint="Off sends nothing at all. Activities and their due dates are untouched."
                />

                <RecordField
                  label="Remind Before"
                  required
                  type="number"
                  suffix="Minutes"
                  value={settings.leadMinutes}
                  onChange={set('leadMinutes')}
                  hint={`Currently ${settings.leadMinutes} minutes before the activity is due.`}
                />

                <div className="nx-rec-field nx-rec-fields__full">
                  <span className="nx-rec-field__label">Common lead times</span>
                  <div className="nx-rec-presets">
                    {BEFORE_PRESETS.map((m) => (
                      <Button
                        key={m}
                        type="button"
                        size="sm"
                        variant={Number(settings.leadMinutes) === m ? 'primary' : 'secondary'}
                        onClick={() => set('leadMinutes')(m)}
                      >
                        {m >= 60 ? `${m / 60} hr` : `${m} min`}
                      </Button>
                    ))}
                  </div>
                </div>

                <RecordField
                  label="Repeat Every"
                  required
                  type="number"
                  suffix="Minutes"
                  value={settings.repeatMinutes}
                  onChange={set('repeatMinutes')}
                  hint={preview || 'Set a repeat no longer than the remind-before time.'}
                />

                <div className="nx-rec-field nx-rec-fields__full">
                  <span className="nx-rec-field__label">Common intervals</span>
                  <div className="nx-rec-presets">
                    {REPEAT_PRESETS.map((m) => (
                      <Button
                        key={m}
                        type="button"
                        size="sm"
                        variant={Number(settings.repeatMinutes) === m ? 'primary' : 'secondary'}
                        onClick={() => set('repeatMinutes')(m)}
                      >
                        {m} min
                      </Button>
                    ))}
                  </div>
                </div>

                <RecordField
                  label="Maximum Reminders"
                  type="number"
                  suffix="Reminders"
                  value={settings.maxReminders}
                  onChange={set('maxReminders')}
                  hint="0 means no cap — the series runs to the due time."
                />

                <RecordField
                  label="Overdue Reminders"
                  required
                  options={['Yes', 'No']}
                  value={settings.overdueEnabled ? 'Yes' : 'No'}
                  onChange={(v) => set('overdueEnabled')(v === 'Yes')}
                  hint="Keep reminding after the due time has passed."
                />

                <RecordField
                  label="Overdue Repeat Every"
                  type="number"
                  suffix="Minutes"
                  value={settings.overdueRepeatMinutes}
                  onChange={set('overdueRepeatMinutes')}
                  hint="How often to chase an activity that is already late."
                />

                <RecordField
                  label="Escalate After"
                  type="number"
                  suffix="Minutes overdue"
                  value={settings.escalateAfterMinutes}
                  onChange={set('escalateAfterMinutes')}
                  hint="The owner's reporting manager is told as well once it has been late this long. 0 never escalates."
                />

                <RecordField
                  label="In-app (Bell)"
                  options={['Yes', 'No']}
                  value={settings.channelInApp ? 'Yes' : 'No'}
                  onChange={(v) => set('channelInApp')(v === 'Yes')}
                  hint="The notification bell. This one always reaches the user."
                />

                <RecordField
                  label="Push Notification"
                  options={['Yes', 'No']}
                  value={settings.channelPush ? 'Yes' : 'No'}
                  onChange={(v) => set('channelPush')(v === 'Yes')}
                  hint="Needs the browser to have notifications turned on for this site."
                />

                <RecordField
                  label="Email"
                  options={['Yes', 'No']}
                  value={settings.channelEmail ? 'Yes' : 'No'}
                  onChange={(v) => set('channelEmail')(v === 'Yes')}
                  hint="Not yet wired to the mail sender — the bell and push are the live channels."
                />
              </RecordFields>

              <div className="nx-rec-form__actions">
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Submit'}
                </Button>
              </div>
            </form>
          </RecordCard>
        </RecordColumn>

        <RecordColumn>
          <RecordCard icon={HelpCircle} title="Need Help ?">
            <div className="nx-rec-help">
              {HELP.map(([term, text]) => (
                <div key={term} className="nx-rec-help__item">
                  <p className="nx-rec-help__term">{term}</p>
                  <p className="nx-rec-help__text">{text}</p>
                </div>
              ))}
            </div>
          </RecordCard>
        </RecordColumn>
      </RecordGrid>
    </RecordPage>
  );
};

export default ReminderSettings;
