import {
  AlertTriangle, Building2, CalendarClock, HardHat, IndianRupee, Users,
} from 'lucide-react';
import './ProjectOverview.css';

/**
 * The counted view of a project.
 *
 * Every figure comes from /api/projects/:id/summary, which queries for it.
 * Where nothing is tracked yet the value is null and this says so — a zero
 * would read as "no units left" rather than "no inventory recorded", and the
 * difference matters on a page people make decisions from.
 */

function money(value, currency = 'INR') {
  if (value === null || value === undefined) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency, maximumFractionDigits: 0, notation: 'compact',
    }).format(value);
  } catch {
    return String(value);
  }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Stat({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className={`nx-po__stat${tone ? ` is-${tone}` : ''}`}>
      <span className="nx-po__stat-icon"><Icon size={16} /></span>
      <div className="nx-po__stat-text">
        <p className="nx-po__stat-label">{label}</p>
        <p className="nx-po__stat-value">{value}</p>
        {sub && <p className="nx-po__stat-sub">{sub}</p>}
      </div>
    </div>
  );
}

export default function ProjectOverview({ summary, loading }) {
  if (loading) {
    return (
      <div className="nx-po" aria-busy="true">
        <div className="nx-po__stats">
          {[0, 1, 2, 3].map((i) => <div key={i} className="nx-po__stat is-skeleton" />)}
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const {
    inventory, counts = {}, crm = {},
    startingPrice, pricePerSqft, currency, daysToCompletion, age,
    daysSinceActivity, gaps = [], archived,
  } = summary;

  return (
    <div className="nx-po">
      {/* ---- the figures worth seeing first ---- */}
      <div className="nx-po__stats">
        <Stat
          icon={Building2}
          label="Inventory"
          /* Null, not zero: no units table entry means none has been recorded,
             which is a different thing from every unit being gone. */
          value={inventory ? inventory.total : 'Not set up'}
          sub={inventory
            ? `${inventory.available} available · ${inventory.sold} sold`
            : 'Add buildings and units to track this'}
          tone={inventory ? undefined : 'neutral'}
        />
        <Stat
          icon={IndianRupee}
          label="Starting price"
          value={money(startingPrice, currency)}
          sub={pricePerSqft ? `${money(pricePerSqft, currency)} per sq ft` : 'Price per sq ft not set'}
        />
        <Stat
          icon={Users}
          label="Leads"
          value={crm.leads ?? 0}
          sub={crm.opportunities
            ? `${plural(crm.opportunities, 'opportunity').replace('opportunitys', 'opportunities')}`
            : 'No opportunities yet'}
        />
        <Stat
          icon={CalendarClock}
          label="Completion"
          value={daysToCompletion === null ? '—'
            : daysToCompletion < 0 ? `${plural(Math.abs(daysToCompletion), 'day')} overdue`
              : plural(daysToCompletion, 'day')}
          sub={daysToCompletion === null ? 'No expected date set' : 'until expected completion'}
          tone={daysToCompletion !== null && daysToCompletion < 0 ? 'danger' : undefined}
        />
      </div>

      {/* ---- what is on the record, counted ---- */}
      <div className="nx-po__counts">
        {[
          ['Activities', counts.activities],
          ['Tasks', counts.tasks, counts.overdueTasks ? `${counts.overdueTasks} overdue` : counts.openTasks ? `${counts.openTasks} open` : null],
          ['Contacts', counts.contacts],
          ['Documents', counts.documents],
          ['Notes', counts.notes],
          ['Age', age === null ? 0 : age, age === null ? null : 'days'],
        ].map(([label, n, note]) => (
          <div key={label} className={n ? undefined : 'is-empty'}>
            <strong>{n ?? 0}</strong>
            <span>{label}</span>
            {note && <em>{note}</em>}
          </div>
        ))}
      </div>

      {/* ---- what is missing ---- */}
      {gaps.length > 0 && (
        <ul className="nx-po__gaps">
          {gaps.map((g) => (
            <li key={g}><AlertTriangle size={13} aria-hidden="true" /> {g}</li>
          ))}
        </ul>
      )}

      {gaps.length === 0 && !archived && (
        <p className="nx-po__clear">
          <HardHat size={13} aria-hidden="true" /> This project record is complete.
        </p>
      )}

      {archived && (
        <p className="nx-po__clear">
          <AlertTriangle size={13} aria-hidden="true" /> This project is archived.
        </p>
      )}

      {daysSinceActivity !== null && daysSinceActivity > 30 && (
        <p className="nx-po__clear">
          <CalendarClock size={13} aria-hidden="true" /> Nothing has happened on this project for {plural(daysSinceActivity, 'day')}.
        </p>
      )}
    </div>
  );
}
