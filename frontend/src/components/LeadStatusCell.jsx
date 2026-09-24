import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { Pill, Popover, toneForStatus, toast, useRecordViewOnly } from '../ui';
import LeadStatusDialog from './LeadStatusDialog';
import { SITE_VISIT_STAGES, statusNeedsDetails } from './LeadStatusUtils';
import invalidateLeadCache, { subscribeLeadCacheInvalidation } from '../utils/invalidateLeadCache';
import './LeadStatusCell.css';

/**
 * The Status cell in a lead table, editable in place.
 *
 * Changing a lead's status meant opening it, changing it, and coming back —
 * for the one field people change most often while working down a list. The
 * pill is the control now: click it, pick, done.
 *
 * The change goes through the same endpoint the profile page uses, so the same
 * log entry is written and the same side effects run.
 */

/* The status list is the same for every row, so it is fetched once for the
   whole table rather than once per cell. The promise itself is cached, so
   fifty rows mounting together still make one request. */
let statusesPromise = null;

function loadStatuses() {
  if (!statusesPromise) {
    statusesPromise = fetch('/api/lead-statuses')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => rows.map((s) => s.statusName).filter(Boolean))
      .catch(() => []);
  }
  return statusesPromise;
}

/* Forget the cached list whenever anything lead-shaped changes. Adding or
   removing a status on the Lead Status master page broadcasts through the
   same channel, and without this the dropdown kept offering the old list
   until the tab was reloaded. The refetch costs one GET, and only on the
   next time a status cell mounts. */
subscribeLeadCacheInvalidation(() => { statusesPromise = null; });

/**
 * The stage, minus the words the pill beside it already says.
 *
 * "Site Visit — Site Visit Scheduled" is the same phrase twice; next to a
 * "Site Visit" pill, "Scheduled" is the part that carries information.
 */
function shortStage(stage) {
  const trimmed = String(stage).replace(/^site visit\s*/i, '').trim();
  return trimmed || stage;
}

/**
 * The menu's contents.
 *
 * Split out so the "which list am I looking at" state resets every time the
 * menu is opened, rather than a lead remembering it was switched last time.
 */
function StatusMenu({ showStages, statuses, current, stage, onPickStatus, onPickStage }) {
  const [showingStatuses, setShowingStatuses] = useState(!showStages);

  if (showingStatuses) {
    return (
      <div className="nx-statuscell__menu" role="listbox">
        {statuses.length === 0 && (
          <p className="nx-statuscell__empty">No statuses set up yet.</p>
        )}
        {statuses.map((name) => (
          <button
            key={name}
            type="button"
            role="option"
            aria-selected={name === current}
            className={`nx-statuscell__option${name === current ? ' is-current' : ''}`}
            onClick={() => onPickStatus(name)}
          >
            <Pill tone={toneForStatus(name)} dot>{name}</Pill>
            {name === current && <Check size={14} aria-hidden="true" />}
          </button>
        ))}

        {showStages && (
          <button
            type="button"
            className="nx-statuscell__switch"
            onClick={() => setShowingStatuses(false)}
          >
            <ArrowLeft size={13} aria-hidden="true" /> Back to site visit
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="nx-statuscell__menu" role="listbox">
      {SITE_VISIT_STAGES.map((name) => (
        <button
          key={`sv-${name}`}
          type="button"
          role="option"
          aria-selected={name === stage}
          className={`nx-statuscell__option${name === stage ? ' is-current' : ''}`}
          onClick={() => onPickStage(name)}
        >
          <span className="nx-statuscell__stage">{name}</span>
          {name === stage && <Check size={14} aria-hidden="true" />}
        </button>
      ))}

      {/* Rare, but a visit can be called off and the lead put back to an
          earlier status. Hidden behind one click rather than gone. */}
      <button
        type="button"
        className="nx-statuscell__switch"
        onClick={() => setShowingStatuses(true)}
      >
        Change lead status <ArrowRight size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

export default function LeadStatusCell({ lead, onChanged, explain = false }) {
  const navigate = useNavigate();
  /* Read from the context rather than taken as a prop, so the one place that
     renders this inside a locked record — the lead profile — locks it without
     passing anything. In the lead LIST there is no provider above it, the
     context is false, and the control behaves exactly as it always has. */
  const locked = useRecordViewOnly();
  const [statuses, setStatuses] = useState([]);
  const [saving, setSaving] = useState(false);
  // The status chosen but not yet saved, while its dialog is open.
  const [pending, setPending] = useState(null);
  const current = lead.status || '';

  useEffect(() => {
    let alive = true;
    loadStatuses().then((list) => { if (alive) setStatuses(list); });
    return () => { alive = false; };
  }, []);

  /** Picking a status: ask for the details it needs, or just save it. */
  const pick = (next, close) => {
    close();
    if (!next || next === current) return;
    if (statusNeedsDetails(next)) {
      setPending(next);
      return;
    }
    save({ status: next });
  };

  /** Picking a site-visit stage. Each one asks for its own details. */
  const pickStage = (name, close) => {
    close();
    setPending(`sv:${name}`);
  };

  /**
   * Converting a lead into an opportunity: create the record, then move the
   * lead onto it.
   *
   * In that order, and the second step only runs if the first succeeded. The
   * profile's version logged the failure and carried on, which left leads
   * marked "Opportunity" with no opportunity behind them.
   */
  const convert = async (bookingStatus) => {
    const actor = localStorage.getItem('loggedInUser') || 'admin';
    setSaving(true);
    try {
      const created = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          opportunityOwner: lead.ownerId || lead.owner || 'admin',
          stage: bookingStatus,
        }),
      });

      if (!created.ok) {
        const data = await created.json().catch(() => ({}));
        toast.error(data.message || 'The opportunity could not be created, so the lead was left as it is.');
        return;
      }

      const opportunity = await created.json().catch(() => ({}));

      const moved = await fetch(`/api/leads/${lead.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Opportunity',
          siteVisitStatus: 'Opportunity',
          bookingStatus,
          username: actor,
          logEntry: {
            title: 'Lead Converted to Opportunity',
            subtitle: `${opportunity.oppId || opportunity.id || 'Opportunity'} created with booking status "${bookingStatus}" by ${actor}`,
          },
        }),
      });

      if (!moved.ok) {
        const data = await moved.json().catch(() => ({}));
        toast.error(`${opportunity.oppId || 'The opportunity'} was created, but the lead could not be updated: ${data.message || 'unknown error'}`);
        return;
      }

      toast.success(`${lead.name || 'Lead'} converted — ${opportunity.oppId || 'opportunity'} created.`);
      setPending(null);
      invalidateLeadCache();
      if (onChanged) onChanged();
      // The lead's work continues on the opportunity, so that is where to be.
      navigate('/opportunities');
    } catch (error) {
      console.error('Failed to convert the lead', error);
      toast.error('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  const save = async (payload) => {
    const { summary, convert: isConvert, ...rest } = payload;
    if (isConvert) return convert(rest.bookingStatus);

    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...rest,
          // So the lead log names who did it rather than always saying "admin".
          username: localStorage.getItem('loggedInUser') || '',
          /* An action (allocating) sends no `status`, so there is no move to
             announce — saying "Site Visit → allocated to ajith" read as a move
             to a stage of that name. It is recorded as what it is instead. */
          ...(summary && summary !== rest.status ? {
            logEntry: rest.status ? {
              title: 'Lead Status Updated',
              subtitle: `${current || '(none)'} → ${summary} by ${localStorage.getItem('loggedInUser') || 'admin'}`,
            } : {
              title: 'Lead Updated',
              subtitle: `${summary} by ${localStorage.getItem('loggedInUser') || 'admin'} — still at ${current || '(no status)'}`,
            },
          } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || 'Could not update the status.');
        return;
      }

      toast.success(`${lead.name || 'Lead'} is now "${rest.status || rest.siteVisitStatus}".`);
      // Every other lead view shows this record too.
      setPending(null);
      invalidateLeadCache();
      if (onChanged) onChanged();
    } catch (error) {
      console.error('Failed to update lead status', error);
      toast.error('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  // A status that is no longer in the master list is still this lead's status,
  // so it is offered alongside the others rather than silently dropped.
  const options = current && !statuses.includes(current)
    ? [current, ...statuses]
    : statuses;

  /* Once a lead is at Site Visit it has a second life of its own — scheduled,
     re-scheduled, confirmed, done — and that is the sequence people actually
     work through. Offering it here saves opening the lead for every step. */
  const atSiteVisit = current === 'Site Visit' || Boolean(lead.siteVisitStatus);
  const stage = lead.siteVisitStatus || (lead.siteVisitDate ? 'Site Visit Scheduled' : '');

  /** A converted lead is finished here; it lives on as an opportunity. */
  const converted = current === 'Opportunity';

  return (
    /* The row opens the lead; this cell must not. */
    <span
      className="nx-statuscell"
      onClick={(e) => e.stopPropagation()}
      role="presentation"
    >
      {/* A converted lead's work carries on as an opportunity, so its pill is
          a way there. The chevron still opens the menu, because a conversion
          can be wrong and the status has to be reachable. */}
      {converted && (
        <button
          type="button"
          className="nx-statuscell__link"
          onClick={() => navigate('/opportunities')}
          title="Go to Opportunities"
        >
          <Pill tone={toneForStatus(current)} dot>{current}</Pill>
        </button>
      )}

      <Popover
        align="start"
        trigger={({ open, toggle, ref }) => (
          <button
            ref={ref}
            type="button"
            className={`nx-statuscell__trigger${open ? ' is-open' : ''}${converted ? ' is-chevron-only' : ''}`}
            onClick={toggle}
            disabled={saving || locked}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={converted ? 'Change status' : undefined}
            title={saving ? 'Saving…' : 'Change status'}
          >
            {/* The stage sits on the same line as the pill. Stacked, it made
                one row taller than its neighbours, and the column stopped
                scanning as a single list of statuses. */}
            {!converted && (current
              ? <Pill tone={toneForStatus(current)} dot>{current}</Pill>
              : <Pill tone="neutral">Set status</Pill>)}
            {!converted && atSiteVisit && stage && stage !== current && (
              <span
                className={`nx-statuscell__substage nx-statuscell__substage--${toneForStatus(stage)}`}
                title={stage}
              >
                {shortStage(stage)}
              </span>
            )}
            {saving
              ? <Loader2 size={13} className="nx-statuscell__spin" aria-hidden="true" />
              : <ChevronDown size={13} className="nx-statuscell__chevron" aria-hidden="true" />}
          </button>
        )}
      >
        {({ close }) => (
          /* A lead at Site Visit moves through the visit's own stages, so
             those are the menu. The lead statuses are still reachable, but
             they are not the question being asked at that point. */
          <StatusMenu
            showStages={atSiteVisit}
            statuses={options}
            current={current}
            stage={stage}
            onPickStatus={(name) => pick(name, close)}
            onPickStage={(name) => pickStage(name, close)}
          />
        )}
      </Popover>

      {/* Statuses that carry information — a rejection reason, a visit date —
          ask for it before the change is saved. */}
      {/* What this control is, for anyone who has not met it before. The pill
          looks like a label, so without a nudge it does not read as something
          you can click. */}
      {explain && (
        <Popover
          align="end"
          width={300}
          trigger={({ open, toggle, ref }) => (
            <button
              ref={ref}
              type="button"
              className={`nx-statushint__btn${open ? ' is-open' : ''}`}
              onClick={toggle}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label="How to change this status"
              title="How to change this status"
            >
              <Sparkles size={13} aria-hidden="true" />
            </button>
          )}
        >
          <div className="nx-statushint">
            <p className="nx-statushint__title">Changing the status</p>
            <ol className="nx-statushint__steps">
              <li>
                Click the <strong>{current || 'status'}</strong> pill to open the list.
              </li>
              <li>Pick where the lead has got to.</li>
              <li>
                If that status needs details — a date, a reason, someone to hand it
                to — a short form opens. Fill it in and save.
              </li>
            </ol>
            <p className="nx-statushint__note">
              Every change is written to the Lead Log with who made it and when,
              and the new owner is told if the lead moves to someone else.
            </p>
          </div>
        </Popover>
      )}

      <LeadStatusDialog
        open={Boolean(pending)}
        status={pending}
        lead={lead}
        saving={saving}
        onCancel={() => setPending(null)}
        onSubmit={save}
      />
    </span>
  );
}
