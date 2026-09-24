import { Activity, AlertTriangle, CalendarClock, Gauge, TrendingUp, Wallet } from 'lucide-react';
import './OpportunityHealth.css';

/**
 * The 360° read on an opportunity: what it is worth, how far along it is, and
 * whether it is going anywhere.
 *
 * Every figure here comes from /api/opportunities/:id/summary and none of it is
 * stored. A weighted value kept in a column can disagree with the two numbers
 * it comes from the moment either changes; computed on read it never can. The
 * same server function feeds the list and the dashboard, so the three cannot
 * quietly diverge.
 */

/** Indian-format money, or a dash when there is nothing to show. */
function money(value, currency = 'INR') {
  if (value === null || value === undefined) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return String(value);
  }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Days as something readable, with overdue said plainly rather than as -4. */
function days(n, { overdueLabel } = {}) {
  if (n === null || n === undefined) return '—';
  if (n < 0 && overdueLabel) return `${plural(Math.abs(n), 'day')} ${overdueLabel}`;
  if (n === 0) return 'Today';
  return plural(n, 'day');
}

/** Which tone a band reads in. Matches the status pills used elsewhere. */
const TONE = {
  Healthy: 'success', 'Needs attention': 'warning', 'At risk': 'danger',
  High: 'success', Medium: 'warning', Low: 'danger', None: 'neutral',
  Won: 'success', Lost: 'danger', Commit: 'success', 'Best case': 'warning', Pipeline: 'info',
};

/** Risk reads the other way round: high risk is bad, high engagement is good. */
const RISK_TONE = { Low: 'success', Medium: 'warning', High: 'danger', None: 'neutral' };

function Stat({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className={`nx-oh__stat${tone ? ` is-${tone}` : ''}`}>
      <span className="nx-oh__stat-icon"><Icon size={16} /></span>
      <div className="nx-oh__stat-text">
        <p className="nx-oh__stat-label">{label}</p>
        <p className="nx-oh__stat-value">{value}</p>
        {sub && <p className="nx-oh__stat-sub">{sub}</p>}
      </div>
    </div>
  );
}

export default function OpportunityHealth({ summary, loading }) {
  if (loading) {
    // Skeletons rather than a spinner: the panel keeps its height, so the rest
    // of the page does not jump when the numbers arrive.
    return (
      <div className="nx-oh" aria-busy="true">
        <div className="nx-oh__stats">
          {[0, 1, 2, 3].map((i) => <div key={i} className="nx-oh__stat is-skeleton" />)}
        </div>
        <div className="nx-oh__rail is-skeleton" />
      </div>
    );
  }

  if (!summary) return null;

  const {
    value, valueSource, currency, probability, assumedProbability, weighted,
    stageIndex, stageOrder = [], closed, age, daysInStage, daysToClose,
    daysSinceActivity, engagement, risk, risks = [], score, health, forecast,
    history = [], counts = {},
  } = summary;

  const timeInStage = Object.fromEntries(history.map((h) => [h.toStage, h.days]));

  return (
    <div className="nx-oh">
      {/* ---- the four figures worth seeing first ---- */}
      <div className="nx-oh__stats">
        <Stat
          icon={Wallet}
          label="Deal value"
          value={money(value, currency)}
          /* Says where the figure came from — entered, from the products on
             the record, or the booking amount — so a number is never shown
             without its provenance. */
          sub={value === null ? 'Not set'
            : weighted !== null ? `${money(weighted, currency)} weighted · ${valueSource}`
              : valueSource}
        />
        <Stat
          icon={TrendingUp}
          label="Probability"
          /* Nothing stored means nothing shown. The stage's usual figure is
             offered underneath as the assumption it is, rather than being
             printed here as though somebody had entered it. */
          value={probability === null ? 'Not set' : `${probability}%`}
          sub={probability === null
            ? (assumedProbability === null
              ? `Forecast: ${forecast}`
              : `Assuming ${assumedProbability}% at this stage`)
            : `Forecast: ${forecast}`}
          tone={probability === null ? 'neutral' : TONE[forecast]}
        />
        <Stat
          icon={Gauge}
          label="Opportunity score"
          value={`${score}/100`}
          sub={health}
          tone={TONE[health]}
        />
        <Stat
          icon={AlertTriangle}
          label="Risk"
          value={risk}
          sub={closed ? 'Closed' : `Engagement: ${engagement}`}
          tone={RISK_TONE[risk]}
        />
      </div>

      {/* ---- where it is in the pipeline ---- */}
      <div className="nx-oh__rail" role="list" aria-label="Pipeline stage">
        {stageOrder.map((name, i) => {
          const done = stageIndex >= 0 && i < stageIndex;
          const current = i === stageIndex;
          const spent = timeInStage[name];
          return (
            <div
              key={name}
              role="listitem"
              className={`nx-oh__step${done ? ' is-done' : ''}${current ? ' is-current' : ''}`}
              title={spent !== undefined ? `${plural(spent, 'day')} in this stage` : undefined}
            >
              <span className="nx-oh__step-dot" />
              <span className="nx-oh__step-name">{name}</span>
              {spent !== undefined && <span className="nx-oh__step-days">{plural(spent, 'day')}</span>}
            </div>
          );
        })}
      </div>

      {/* ---- the timings ---- */}
      <div className="nx-oh__facts">
        <div><span>In this stage</span><strong>{days(daysInStage)}</strong></div>
        <div><span>Total age</span><strong>{days(age)}</strong></div>
        <div>
          <span>Closes in</span>
          <strong className={daysToClose !== null && daysToClose < 0 ? 'is-overdue' : undefined}>
            {days(daysToClose, { overdueLabel: 'overdue' })}
          </strong>
        </div>
        <div>
          <span>Last activity</span>
          {/* Measured from activity rows. It used to fall back to the record's
              updatedAt, so simply saving it read as activity. */}
          <strong>{daysSinceActivity === null ? 'None recorded'
            : days(daysSinceActivity) === 'Today' ? 'Today'
              : `${days(daysSinceActivity)} ago`}</strong>
        </div>
      </div>

      {/* ---- what is actually on this record ---- */}
      <div className="nx-oh__counts">
        {[
          ['Activities', counts.activities],
          ['Tasks', counts.tasks, counts.overdueTasks ? `${counts.overdueTasks} overdue` : counts.openTasks ? `${counts.openTasks} open` : null],
          ['Contacts', counts.contacts],
          ['Products', counts.products],
          ['Documents', counts.documents],
          ['Notes', counts.notes],
        ].map(([label, n, note]) => (
          <div key={label} className={n ? undefined : 'is-empty'}>
            <strong>{n ?? 0}</strong>
            <span>{label}</span>
            {note && <em>{note}</em>}
          </div>
        ))}
      </div>

      {/* ---- why the score is what it is ---- */}
      {risks.length > 0 && (
        <ul className="nx-oh__risks">
          {risks.map((r) => (
            <li key={r}><AlertTriangle size={13} aria-hidden="true" /> {r}</li>
          ))}
        </ul>
      )}

      {closed && (
        <p className="nx-oh__closed">
          <Activity size={13} aria-hidden="true" /> This opportunity is closed, so it is no longer forecast.
        </p>
      )}

      {!closed && risks.length === 0 && (
        <p className="nx-oh__clear">
          <CalendarClock size={13} aria-hidden="true" /> Nothing is holding this one back.
        </p>
      )}
    </div>
  );
}
