import { useEffect, useState } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import './FollowUpCountdown.css';

/**
 * How long the current owner has left before the lead moves on.
 *
 * The server sends a deadline, not a number of seconds — a countdown computed
 * there would be wrong by the time it arrived, and wronger the longer the tab
 * stayed open. This ticks locally against that fixed instant instead, so it
 * stays honest across a sleeping laptop or a tab left open overnight.
 *
 * Renders nothing when no window is open, which is most leads most of the
 * time: a lead nobody is waiting on looks exactly as it did before.
 */

/* ---------------------------------------------------------------------------
   One clock for the whole page.

   A table shows 25 of these at once and each wants to re-render every second.
   Twenty-five intervals drifting against each other would tick raggedly and
   wake the tab twenty-five times a second's worth; one interval, shared, ticks
   them together. It only runs while something is actually counting.
   --------------------------------------------------------------------------- */
const subscribers = new Set();
let ticker = null;

function subscribe(fn) {
  subscribers.add(fn);
  if (!ticker) {
    ticker = setInterval(() => {
      const now = Date.now();
      subscribers.forEach((s) => s(now));
    }, 1000);
  }
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  };
}

/** Subscribes to the shared clock, or stays still when there is nothing to count. */
function useSharedNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    return subscribe(setNow);
  }, [active]);
  return now;
}

/**
 * @param {object}  followUp  { dueAt, assignedAt, cycle, ownerName }
 * @param {boolean} compact   the table-cell form: no words, just the clock
 */
export default function FollowUpCountdown({ followUp, compact = false }) {
  const dueAt = followUp?.dueAt ? new Date(followUp.dueAt).getTime() : null;
  const now = useSharedNow(Boolean(dueAt));

  if (!dueAt) return null;

  const msLeft = dueAt - now;
  const overdue = msLeft <= 0;

  const total = Math.abs(Math.floor(msLeft / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock = hours > 0
    ? `${hours}h ${String(minutes).padStart(2, '0')}m`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;

  /* Under five minutes is the point where it stops being information and
     starts being a prompt, so that is where the colour and the pulse change. */
  const urgent = !overdue && msLeft < 5 * 60 * 1000;
  const tone = overdue ? 'is-overdue' : urgent ? 'is-urgent' : 'is-ok';

  /* How much of the window has gone, for the bar underneath. Derived from the
     window's own length rather than a fixed 30 minutes, so it stays honest
     when the timeout setting changes. */
  const started = followUp.assignedAt ? new Date(followUp.assignedAt).getTime() : null;
  const span = started ? dueAt - started : null;
  const elapsed = span && span > 0
    ? Math.min(100, Math.max(0, ((now - started) / span) * 100))
    : null;

  /* The message, spelled out. The pill itself has room for a clock and nothing
     else, so this is where it says what the clock means — who owes the update,
     what happens if it does not come, and where the lead goes next. */
  const who = followUp.ownerName || 'the assigned owner';
  const title = overdue
    ? `Overdue — ${who} did not update this lead in time. `
      + 'It will be reassigned to the next user on the project round-robin at the next check '
      + '(within a minute). Updating the status now still stops the move.'
    : `${clock} left for ${who} to update this lead. `
      + 'If there is no update before then it will be reassigned automatically to the next '
      + 'user on the project round-robin. Any status change, call log or note stops the clock.';

  return (
    <span
      className={`nx-followup ${tone}${compact ? ' is-compact' : ''}`}
      title={title}
      role="status"
      /* Announced only when it becomes urgent. A polite region that changed
         every second would make a screen reader unusable. */
      aria-live={urgent || overdue ? 'polite' : 'off'}
    >
      <span className="nx-followup__icon" aria-hidden="true">
        {overdue ? <AlertTriangle size={13} /> : <Clock size={13} />}
      </span>

      <span className="nx-followup__label">
        {overdue
          ? (compact ? `+${clock}` : 'Response overdue')
          : (compact ? clock : `${clock} to respond`)}
      </span>

      {followUp.cycle > 0 && !compact && (
        <span className="nx-followup__cycle" title={`Reassigned ${followUp.cycle} time(s)`}>
          ·&nbsp;{followUp.cycle}
        </span>
      )}

      {elapsed !== null && (
        <span className="nx-followup__bar" aria-hidden="true">
          <span className="nx-followup__bar-fill" style={{ width: `${elapsed}%` }} />
        </span>
      )}
    </span>
  );
}
