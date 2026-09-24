import { useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRecordTitle } from './hooks/usePageMeta';
import {
  Check, X, AlertTriangle, ArrowLeft,
  User, Mail, Building2, Briefcase, Calendar, Hash, Link2, Globe,
  Flame, Snowflake, Thermometer, Clock, MessageSquare, Activity,
  CheckCircle2, Circle, Users, Tag, Video, MapPin, PhoneCall, Send, MessageCircle, Paperclip,
} from 'lucide-react';
import useLiveRefresh from './utils/useLiveRefresh';
import { boundsFor } from './utils/dateBounds';
import './LeadProfile.css';
import './Leads.css';
import invalidateLeadCache from './utils/invalidateLeadCache';
import { assignableUsers } from './utils/currentUser';
import LeadStatusCell from './components/LeadStatusCell';
import FollowUpCountdown from './components/FollowUpCountdown';
import { LeadConversations, RecordDocuments } from './features/LeadComms';
import {
  DEFAULT_DIAL, Select, emailError, normalizeEmail,
  RecordField, RecordLookupField, RecordPhoneField, RecordUserField,
  RecordViewOnly, recordStamp,
} from './ui';

/* ---------------------------------------------------------------------------
   Page-level constants.
   ------------------------------------------------------------------------- */

const LEAD_TABS = [
  { key: 'General', icon: User },
  { key: 'Follow-up', icon: Clock },
  { key: 'Notes', icon: MessageSquare },
  // WhatsApp and click-to-call (features/LeadComms.jsx).
  { key: 'Conversations', icon: MessageCircle },
  { key: 'Documents', icon: Paperclip },
];

/**
 * Whether this lead has anything to show under Attempted.
 *
 * True while the status says so, and afterwards for as long as a call was
 * actually recorded — a number dialled at "Attempted" is still worth reading
 * once the lead has moved on to Site Visit, and hiding it would strand it.
 *
 * Interested counts as well: "Mark as Interested" records a follow-up date and
 * remarks, which is what this tab shows. Keyed on the status rather than on
 * followUpDate, because plenty of leads carry a follow-up date without any
 * call behind it and those do not belong here.
 */
const hasAttemptDetails = (lead) => Boolean(
  lead && (
    lead.status === 'Attempted'
    || lead.status === 'Interested'
    || lead.openReason
    || lead.callStatus
    || lead.callRemarks
  ),
);



/**
 * Whether this lead has anything to show under Site Visit Details.
 *
 * True at that status, and afterwards for as long as a visit was actually
 * recorded. A lead that has become an Opportunity still went on the visit
 * that got it there, and the dates and notes are worth reading.
 */
const hasSiteVisitDetails = (lead) => Boolean(
  lead && (
    lead.status === 'Site Visit'
    || lead.siteVisitStatus
    || lead.siteVisitDate
    || lead.siteVisitConfirmedDate
    || lead.siteVisitDoneDate
    || lead.siteVisitNote
    || lead.siteVisitConfirmedNote
    || lead.siteVisitDoneNote
  ),
);

/**
 * The sub-tab a status is about, for the statuses that have one.
 *
 * Opening the profile lands on it: the status is the reason the record is
 * being looked at, so its details should not take a click to reach.
 */
const TAB_FOR_STATUS = {
  Attempted: 'Attempted',
  Interested: 'Attempted',
  'Site Visit': 'Site Visit Details',
};

/** The five stages shown in the progress rail, in order. */
const PROGRESS_STAGES = ['New Lead', 'Contacted', 'Site Visit', 'Negotiation', 'Closed'];

/**
 * Maps the many statuses the CRM stores onto the five display stages.
 * Anything unrecognised sits at "Contacted" — the lead has clearly moved past
 * New Lead, but we have no evidence of a later stage.
 */
const stageIndexFor = (status) => {
  switch (status) {
    case 'New Lead': case '': case undefined: case null: return 0;
    case 'Site Visit': return 2;
    case 'Opportunity': case 'Negotiation': return 3;
    case 'Closed': case 'Booked': case 'Rejected': return 4;
    default: return 1;
  }
};

/**
 * How a lead's id should read on screen.
 *
 * Ids used to be uuids, so the page dressed them up: an `ENQ_` prefix, cut to
 * eight characters to keep them short. Ids are now readable in their own right
 * — LED-2026-012 — and that dressing corrupts them, turning the id into
 * "ENQ_LED-2026-012" in one place and the truncated "ENQ_LED-2026" in another.
 *
 * A modern id is shown exactly as stored. Anything older keeps the old
 * treatment, since a bare uuid on screen helps nobody.
 */
const RECORD_ID = /^[A-Z]{3}-\d{4}-\d+$/;

const displayLeadId = (id, { short = false } = {}) => {
  const value = String(id || '');
  if (!value) return '';
  if (RECORD_ID.test(value) || value.startsWith('ENQ')) return value;
  return `ENQ_${short ? value.slice(0, 8) : value}`;
};

const RATINGS = [
  { key: 'hot', label: 'Hot', icon: Flame },
  { key: 'warm', label: 'Warm', icon: Thermometer },
  { key: 'cold', label: 'Cold', icon: Snowflake },
];


export default function LeadProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [mainTab, setMainTab] = useState('General');
  const [logFilter, setLogFilter] = useState('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState({ visible: false, type: '', message: '' });

  const showToast = (type, message) => {
    setToast({ visible: true, type, message });
    setTimeout(() => setToast({ visible: false, type: '', message: '' }), 5000);
  };

  const [savedRating, setSavedRating] = useState('warm');
  const [selectedRating, setSelectedRating] = useState('warm');
  const [lead, setLead] = useState(null);

  // The tab says which record is open, not just which kind.
  useRecordTitle(lead?.name);
  const [logs, setLogs] = useState([]);
  const [usersList, setUsersList] = useState([]);
  // The Attempted dropdowns are master lists, editable in the status dialog.
  const [openReasons, setOpenReasons] = useState([]);
  const [callStatuses, setCallStatuses] = useState([]);
  const [rejectedModalOpen, setRejectedModalOpen] = useState(false);
  const [rejectedModalSource, setRejectedModalSource] = useState(null);

  const [rejectedFormData, setRejectedFormData] = useState({
    rejectedReason: ''
  });

  const [reScheduledModalOpen, setReScheduledModalOpen] = useState(false);
  const [confirmedModalOpen, setConfirmedModalOpen] = useState(false);
  const [doneModalOpen, setDoneModalOpen] = useState(false);
  const [opportunityModalOpen, setOpportunityModalOpen] = useState(false);

  const [reScheduledFormData, setReScheduledFormData] = useState({
    siteVisitDate: '',
    siteVisitNote: ''
  });

  const [confirmedFormData, setConfirmedFormData] = useState({
    siteVisitConfirmedDate: '',
    siteVisitConfirmedNote: '',
    leadOwner: ''
  });

  const [doneFormData, setDoneFormData] = useState({
    siteVisitDoneDate: '',
    siteVisitDoneNote: ''
  });

  const [opportunityFormData, setOpportunityFormData] = useState({
    bookingStatus: ''
  });

  const [siteVisitTab, setSiteVisitTab] = useState('Scheduled');
  const [generalTab, setGeneralTab] = useState('Contact Details');

  /* The tab strip follows the recorded site-visit status when a record is
     opened, so a lead whose visit is already confirmed or done lands on the
     matching tab rather than always defaulting to "Scheduled". Once the
     viewer picks a tab by hand, their choice wins until the next record. */
  const siteVisitTabTouchedRef = useRef(false);
  const siteVisitTabForStatus = (siteVisitStatus) => {
    switch (siteVisitStatus) {
      case 'Site Visit Confirmed': return 'Confirmed';
      case 'Site Visit Done':
      case 'Opportunity':
      case 'Rejected': return 'Done';
      default: return 'Scheduled';
    }
  };

  useEffect(() => {
    siteVisitTabTouchedRef.current = false;
    fetchLead();
    fetchUsers();
    fetchMaster('/api/open-reasons', 'reasonName', setOpenReasons);
    fetchMaster('/api/call-statuses', 'statusName', setCallStatuses);
    // The record id decides what to load; the fetchers close over it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* This record is edited field by field and each field saves on its own, so
     there is no half-typed form here to protect — the risk runs the other way,
     of showing a status or an owner that somebody changed elsewhere. */
  useLiveRefresh(['leads', 'users', 'open-reasons', 'call-statuses'], () => {
    fetchLead();
    fetchUsers();
  });

  /**
   * Loads a master list, as plain names for the dropdowns.
   *
   * A failure leaves the list empty rather than throwing: RecordField still
   * shows the value already on the lead, so nothing on screen is lost.
   */
  const fetchMaster = async (url, field, apply) => {
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const rows = await response.json();
      apply(Array.isArray(rows) ? rows.map((r) => r[field]).filter(Boolean) : []);
    } catch (error) {
      console.error(`Failed to fetch ${url}:`, error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsersList(data);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchLead = async () => {
    try {
      const response = await fetch(`/api/leads/${id}`);
      if (response.ok) {
        const data = await response.json();
        setLead(data);
        setSavedRating(data.rating || 'warm');
        setSelectedRating(data.rating || 'warm');
        setLogs(data.logs || []);
        if (!siteVisitTabTouchedRef.current) {
          setSiteVisitTab(siteVisitTabForStatus(data.siteVisitStatus));
        }
      }
    } catch (error) {
      console.error('Failed to fetch lead:', error);
    }
  };

  /**
   * After a successful lead mutation, notify every other lead-aware component
   * (list pages, tabs, dashboard) to reload from the API. The calling handler
   * is still responsible for refreshing this detail view via fetchLead().
   *
   * Keeping the broadcast separate from fetchLead() avoids redundant requests
   * when a handler already refetches the current record as part of its flow.
   */
  const afterLeadMutation = () => {
    invalidateLeadCache();
  };

  const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset() * 60000;
    return (new Date(date.getTime() - offset)).toISOString().slice(0, 16);
  };

  /* A lead can leave the Attempted tab behind — its status is cleared, or the
     call details are emptied. Without this the page would sit on a tab that is
     no longer in the strip, showing nothing at all.

     Above the early return below, because a hook cannot run conditionally. */
  const attemptTabShown = hasAttemptDetails(lead);
  const siteVisitTabShown = hasSiteVisitDetails(lead);
  useEffect(() => {
    if (!attemptTabShown && generalTab === 'Attempted') setGeneralTab('Contact Details');
    if (!siteVisitTabShown && generalTab === 'Site Visit Details') setGeneralTab('Contact Details');
    // Source Information was merged into Lead Information; a saved or stale
    // selection would otherwise show an empty panel.
    if (generalTab === 'Source Information') setGeneralTab('Lead Information');
  }, [attemptTabShown, siteVisitTabShown, generalTab]);

  /* A lead opens on the tab its status is about. Once per lead only —
     re-applying it on every render would make the other tabs impossible to
     stay on. */
  const openedTabFor = useRef(null);
  useEffect(() => {
    if (!lead || openedTabFor.current === lead.id) return;
    openedTabFor.current = lead.id;
    const tab = TAB_FOR_STATUS[lead.status];
    if (tab) {
      setMainTab('General');
      setGeneralTab(tab);
    }
  }, [lead]);

  if (!lead) return <div>Loading...</div>;

  const leadName = lead.name || 'Lead User';

  /* Converted leads are read-only. The opportunity is where the work happens
     from here, and it was created from these values — editing them afterwards
     would leave the two telling different stories about the same customer. */
  const isConverted = lead.status === 'Opportunity';

  /* Allocating a lead hands the work over. The allocator keeps it in sight —
     they are still answerable for it — but the owner is the one working it,
     and two people editing one record from opposite sides is how a follow-up
     date gets overwritten by somebody who is no longer making the calls.

     The API decides this and sends the answer, rather than the rule being
     written out a second time here: blockAllocatorEdits enforces it on every
     lead write, and a copy in the browser could only drift from it. Note the
     lead's own `allocator` cannot be used for this — it is now the person who
     allocated the lead to whoever is READING it, which is a different
     question from who allocated it away. */
  const allocatorOnly = Boolean(lead.readOnlyForViewer);

  const viewOnly = isConverted || allocatorOnly;

  const handleRejectedSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 3000));
    try {
      const payload = rejectedModalSource === 'SiteVisit'
        ? {
          siteVisitStatus: 'Rejected',
          reasonDetails: rejectedFormData.rejectedReason,
          logEntry: {
            title: 'Site Visit Status Updated',
            subtitle: `by admin as Rejected - ${rejectedFormData.rejectedReason}`
          }
        }
        : {
          status: 'Rejected',
          reasonDetails: rejectedFormData.rejectedReason,
          logEntry: {
            title: 'Lead Status Updated',
            subtitle: `by admin as Rejected - ${rejectedFormData.rejectedReason}`
          }
        };

      const response = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        setRejectedModalOpen(false);
        fetchLead();
        afterLeadMutation(); // keep every other lead view in sync
        const toastMsg = rejectedModalSource === 'SiteVisit'
          ? 'Site visit status is rejected successfully'
          : 'Lead status is updated as Rejected successfully';
        showToast('success', toastMsg);
      }
    } catch (error) {
      console.error('Failed to save Rejected status:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Saves several fields in one request. The country code has to travel with
   * the number it belongs to, otherwise a half-applied save leaves the lead
   * with a dial code that does not match its mobile.
   */
  const handleFieldsSubmit = async (fields) => {
    try {
      const response = await fetch(`/api/leads/${id}/fields`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields)
      });
      if (response.ok) {
        fetchLead();
        afterLeadMutation();
      } else {
        const data = await response.json().catch(() => ({}));
        showToast('error', data.message || 'Could not save the change.');
      }
    } catch (error) {
      console.error('Failed to save fields:', error);
      showToast('error', 'Could not save the change.');
    }
  };

  /**
   * Reassigning the lead, with a confirmation first.
   *
   * Every other field here saves the moment you leave it, which suits a typo
   * in a phone number. Ownership is different: it hands the lead to someone
   * else and takes it out of the current owner's list, and the picker is one
   * click — easy to brush past the wrong name and not notice.
   */
  const changeOwner = async (nextId) => {
    const nameOf = (who) => {
      const user = usersList.find((u) => u.id === who || u.username === who);
      return user ? (user.username || user.firstName || who) : (who || 'nobody');
    };

    const from = nameOf(lead.owner);
    const to = nameOf(nextId);

    const ok = await window.appConfirm(
      `Move this lead from ${from} to ${to}?\n\n`
      + `${leadName} will leave ${from}'s list and appear in ${to}'s.`,
      'Change lead owner',
    );
    if (!ok) return;

    await handleGenericSubmit('owner', nextId);
  };

  const handleGenericSubmit = async (field, value) => {
    /* The last line of defence. Every control above is disabled on a converted
       lead, but a control that slips through should not be able to write. */
    if (lead?.status === 'Opportunity') return;
    try {
      // Use the dedicated fields endpoint — no log entry, no status change
      const response = await fetch(`/api/leads/${id}/fields`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      });
      if (response.ok) {
        fetchLead(); // refresh this detail view
        afterLeadMutation(); // keep every other lead view in sync
      }
    } catch (error) {
      console.error(`Failed to save ${field}:`, error);
    }
  };

  const handleReScheduledSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteVisitStatus: 'Re Scheduled Visit',
          siteVisitDate: reScheduledFormData.siteVisitDate,
          siteVisitNote: reScheduledFormData.siteVisitNote,
          logEntry: {
            title: 'Site Visit Status Updated',
            subtitle: `by admin as Re Scheduled Visit`
          }
        })
      });
      if (response.ok) {
        setReScheduledModalOpen(false);
        fetchLead();
        afterLeadMutation(); // keep every other lead view in sync
        showToast('success', 'Site visit status updated to Re Scheduled Visit successfully');
      }
    } catch (error) {
      console.error('Failed to save Re Scheduled Visit status:', error);
    }
  };

  const handleConfirmedSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteVisitStatus: 'Site Visit Confirmed',
          siteVisitConfirmedDate: confirmedFormData.siteVisitConfirmedDate,
          siteVisitConfirmedNote: confirmedFormData.siteVisitConfirmedNote,
          owner: confirmedFormData.leadOwner,
          logEntry: {
            title: 'Site Visit Status Updated',
            subtitle: `by admin as Site Visit Confirmed`
          }
        })
      });
      if (response.ok) {
        setConfirmedModalOpen(false);
        fetchLead();
        afterLeadMutation(); // keep every other lead view in sync
        showToast('success', 'Site visit status updated to Site Visit Confirmed successfully');
      }
    } catch (error) {
      console.error('Failed to save Confirmed status:', error);
    }
  };

  const handleDoneSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteVisitStatus: 'Site Visit Done',
          siteVisitDoneDate: doneFormData.siteVisitDoneDate,
          siteVisitDoneNote: doneFormData.siteVisitDoneNote,
          logEntry: {
            title: 'Site Visit Status Updated',
            subtitle: `by admin as Site Visit Done`
          }
        })
      });
      if (response.ok) {
        setDoneModalOpen(false);
        fetchLead();
        afterLeadMutation(); // keep every other lead view in sync
        showToast('success', 'Site visit status updated to Site Visit Done successfully');
      }
    } catch (error) {
      console.error('Failed to save Done status:', error);
    }
  };

  const handleOpportunitySubmit = async (e) => {
    e.preventDefault();
    try {
      // 1. Create the Opportunity record
      const oppResponse = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: id,
          opportunityOwner: lead.owner || 'admin',
          stage: opportunityFormData.bookingStatus || 'Opportunity'
        })
      });

      // Stop here if the record was not created. Carrying on marked the lead
      // "Opportunity" with no opportunity behind it, and the only sign was a
      // line in the browser console.
      if (!oppResponse.ok) {
        const data = await oppResponse.json().catch(() => ({}));
        showToast('error', data.message || 'The opportunity could not be created, so the lead was left as it is.');
        return;
      }

      // 2. Update Lead Status
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Opportunity',
          siteVisitStatus: 'Opportunity',
          bookingStatus: opportunityFormData.bookingStatus,
          logEntry: {
            title: 'Lead Converted to Opportunity',
            subtitle: `by admin with booking status: ${opportunityFormData.bookingStatus}`
          }
        })
      });
      if (response.ok) {
        setOpportunityModalOpen(false);
        fetchLead();
        afterLeadMutation(); // keep every other lead view in sync
        navigate('/opportunities');
      }
    } catch (error) {
      console.error('Failed to save Opportunity status:', error);
    }
  };

  // Statuses that need extra details before they can be applied — each opens
  // its own modal, which submits the status change once the form is filled.
  // Newest first. Log dates arrive in two shapes: an ISO timestamp, or the
  // "on 04-Mar-2026 11:20:31 AM" string the older handlers wrote.
  const parseLogDate = (d) => {
    if (!d) return 0;
    const str = String(d).startsWith('on ') ? String(d).slice(3) : String(d);
    // Almost every entry is now an ISO timestamp, so try that first — the
    // dash-stripping below is only for the older "04-Mar-2026 11:20 AM" rows,
    // and it would mangle an ISO date if it ran first.
    const iso = Date.parse(str);
    if (!Number.isNaN(iso)) return iso;
    const legacy = Date.parse(str.replace(/-/g, ' '));
    return Number.isNaN(legacy) ? 0 : legacy;
  };

  const sortedLogs = [...logs].sort((a, b) => parseLogDate(b.date) - parseLogDate(a.date));
  const logTitles = [...new Set(sortedLogs.map((l) => l.title).filter(Boolean))];
  const visibleLogs = logFilter === 'all' ? sortedLogs : sortedLogs.filter((l) => l.title === logFilter);

  const currentStage = stageIndexFor(lead.status);

  const visibleTabs = LEAD_TABS;

  const renderLogList = (list = visibleLogs, emptyText = null) => (
    <div className="nx-rec-log">
      {list.length === 0 && (
        <p className="nx-rec-log__empty">
          {emptyText
            || (sortedLogs.length === 0 ? 'No activity recorded yet.' : 'No activity matches this filter.')}
        </p>
      )}
      {list.map((log, idx) => (
        <div className="nx-rec-log__item" key={log.id || idx}>
          <span className="nx-rec-log__dot"><Activity size={14} /></span>
          <div className="nx-rec-log__body">
            <p className="nx-rec-log__title">{log.title}</p>
            {log.subtitle && <p className="nx-rec-log__meta">{log.subtitle}</p>}
            <p className="nx-rec-log__date"><Clock size={11} /> {recordStamp(log.date)}</p>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <RecordViewOnly active={viewOnly}>
      <div className="nx-rec">
        <div className="nx-rec__topbar">
          <nav className="nx-rec__crumb">
            <span className="is-current" style={{ fontSize: '18px', fontWeight: '600', color: 'var(--nx-text)' }}>
              Leads : {leadName} {lead.mobile ? `[${[lead.mobileCountryCode, lead.mobile].filter(Boolean).join(' ')}]` : ''}
            </span>
          </nav>

          {/* How long the owner has left to respond before the lead moves to
            the next person on the project rota. Only while a window is open,
            so a lead nobody is waiting on looks exactly as it did before. */}
          <FollowUpCountdown followUp={lead.followUp} />

          {/* The status, where it can be changed without hunting for the field
            among everything else on the page. Same control as the lead lists,
            so the menu and its popups behave identically in both places. */}
          <LeadStatusCell lead={lead} onChanged={fetchLead} explain />

          <button type="button" className="nx-rec__back" onClick={() => navigate('/leads')}>
            <ArrowLeft size={15} aria-hidden="true" />
            <span>Back to Leads</span>
          </button>
        </div >

        {/* Says why the controls are dead. Without it the page just looks
            broken to the one person most likely to open it — the colleague who
            handed the lead on and came back to check how it is going. */}
        {allocatorOnly && (
          <div className="nx-lead-readonly" role="status">
            <AlertTriangle size={15} aria-hidden="true" />
            <span>
              You allocated this lead to <strong>{lead.owner || 'someone else'}</strong>, so it is
              read-only for you. They can edit it, or an administrator.
            </span>
          </div>
        )}

        <div className="nx-rec__tabs" role="tablist" style={{ position: 'relative', top: 0, zIndex: 10, background: 'var(--nx-bg-app)' }}>
          {visibleTabs.map(({ key, icon: TabIcon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mainTab === key}
              className={`nx-rec__tab${mainTab === key ? ' is-active' : ''}`}
              onClick={() => setMainTab(key)}
            >
              <TabIcon size={14} /> {key}
            </button>
          ))}
        </div>

        <div className="lp-body-wrap">
          <div className="lp-body-wrap__main">

            {
              mainTab === 'General' && (
                <div className="nx-rec__subtabs-wrap">
                  {/* Sub-tab bar */}
                  <div className="nx-rec__subtabs">
                    {[
                      { key: 'Contact Details', icon: User },
                      { key: 'Lead Information', icon: Tag },
                      /* The status tabs come last, in the order a lead moves
                         through them: the call that was made, then the visit it
                         arranged. Each only appears when it applies. */
                      ...(hasAttemptDetails(lead) ? [{ key: 'Attempted', icon: PhoneCall }] : []),
                      ...(hasSiteVisitDetails(lead) ? [{ key: 'Site Visit Details', icon: MapPin }] : []),
                    ].map(({ key, icon: SIcon }) => (
                      <button
                        key={key}
                        type="button"
                        className={`nx-rec__subtab${generalTab === key ? ' is-active' : ''}`}
                        onClick={() => setGeneralTab(key)}
                      >
                        <SIcon size={14} /> {key}
                      </button>
                    ))}
                  </div>

                  {/* Contact Details sub-tab */}
                  {generalTab === 'Contact Details' && (
                    <div className="nx-rec__grid nx-rec__grid--1">
                      <div className="nx-rec__col">
                        <section className="nx-rec-card">
                          <header className="nx-rec-card__head">
                            <span className="nx-rec-card__icon"><User size={16} /></span>
                            <div className="nx-rec-card__titles">
                              <h2 className="nx-rec-card__title">Contact Details</h2>
                              <p className="nx-rec-card__sub">Identity and contact information</p>
                            </div>
                            <span className="nx-rec-card__pill">Lead ID: {lead.id}</span>
                          </header>
                          <div className="nx-rec-card__body">
                            <div className="nx-rec-fields">
                              <RecordField label="Leads ID" icon={Hash} value={displayLeadId(lead.id)} readOnly />
                              <RecordField label="Leads Name" icon={User} required value={lead.name || ''} onSave={(v) => handleGenericSubmit('name', v)} />
                              <RecordPhoneField
                                label="Mobile Number"
                                required
                                name="mobile"
                                countryName="mobileCountryCode"
                                value={lead.mobile || ''}
                                dial={lead.mobileCountryCode || DEFAULT_DIAL}
                                onSave={(num, code) => handleFieldsSubmit({ mobile: num, mobileCountryCode: code })}
                              />
                              <RecordField
                                label="Email"
                                icon={Mail}
                                type="email"
                                value={lead.email || ''}
                                placeholder="Not set"
                                normalize={normalizeEmail}
                                validate={(v) => emailError(v, { label: 'Email' })}
                                onSave={(v) => handleGenericSubmit('email', v)}
                                action={lead.email ? (
                                  <a className="nx-rec-field__action" href={`mailto:${lead.email}`} title={`Send an email to ${lead.email}`}><Send size={15} /></a>
                                ) : null}
                              />
                              <RecordPhoneField
                                label="Alternate No."
                                name="alternateNo"
                                countryName="alternateNoCountryCode"
                                value={lead.alternateNo || ''}
                                dial={lead.alternateNoCountryCode || DEFAULT_DIAL}
                                onSave={(num, code) => handleFieldsSubmit({ alternateNo: num, alternateNoCountryCode: code })}
                                action={lead.alternateNo ? (
                                  <a className="nx-rec-field__action nx-rec-field__action--call" href={`tel:${lead.alternateNo}`} title="Call"><PhoneCall size={15} /></a>
                                ) : null}
                              />
                              <RecordField
                                label="Alternate Email"
                                icon={Mail}
                                type="email"
                                value={lead.alternateEmail || ''}
                                placeholder="Not set"
                                normalize={normalizeEmail}
                                validate={(v) => emailError(v, { label: 'Alternate Email' })}
                                onSave={(v) => handleGenericSubmit('alternateEmail', v)}
                                action={lead.alternateEmail ? (
                                  <a className="nx-rec-field__action" href={`mailto:${lead.alternateEmail}`} title={`Send an email to ${lead.alternateEmail}`}><Send size={15} /></a>
                                ) : null}
                              />
                              <RecordField label="Occupation" icon={Briefcase} value={lead.occupation || ''} placeholder="Not set" onSave={(v) => handleGenericSubmit('occupation', v)} />
                              <RecordField label="Company Name" icon={Building2} value={lead.companyName || ''} placeholder="Not set" onSave={(v) => handleGenericSubmit('companyName', v)} />
                              <RecordLookupField label="Project Name" apiUrl="/api/projects" displayKey="projectName" valueKey="projectName" postPayloadKey="projectName" placeholder="Select a project" value={lead.project} onSave={(v) => handleGenericSubmit('project', v)} />
                              <RecordField label="Virtual Visit" icon={Video} options={['Yes', 'No', 'Scheduled']} value={lead.virtualVisit || ''} onSave={(v) => handleGenericSubmit('virtualVisit', v)} />
                              <RecordField label="Virtual Visit Date" icon={Calendar} type="datetime-local" when="future" value={formatDateForInput(lead.virtualVisitDate)} onSave={(v) => handleGenericSubmit('virtualVisitDate', v)} />
                            </div>
                          </div>
                        </section>
                      </div>

                    </div>
                  )}



                  {/* Site Visit Details sub-tab */}
                  {generalTab === 'Site Visit Details' && hasSiteVisitDetails(lead) && (
                    <section className="nx-rec-card">
                      <header className="nx-rec-card__head">
                        <span className="nx-rec-card__icon"><MapPin size={16} /></span>
                        <div className="nx-rec-card__titles">
                          <h2 className="nx-rec-card__title">Site Visit Details</h2>
                          <p className="nx-rec-card__sub">Scheduled, confirmed and completed visits</p>
                        </div>
                      </header>
                      <div className="nx-rec-card__body">
                        <RecordField
                          label="Site Visit Status"
                          icon={Activity}
                          /* Every value here opens its own dialog, which is
                             where the change is actually confirmed. Requiring
                             a tick first asked twice for one decision. */
                          saveOnPick
                          options={['Site Visit Scheduled', 'Re Scheduled Visit', 'Site Visit Confirmed', 'Site Visit Done', 'Opportunity', 'Rejected']}
                          value={lead.siteVisitStatus || (lead.siteVisitDate ? 'Site Visit Scheduled' : '')}
                          onSave={(val) => {
                            if (val === 'Re Scheduled Visit') setReScheduledModalOpen(true);
                            else if (val === 'Site Visit Confirmed') {
                              setConfirmedFormData((prev) => ({ ...prev, leadOwner: lead.owner || '' }));
                              setConfirmedModalOpen(true);
                            } else if (val === 'Site Visit Done') setDoneModalOpen(true);
                            else if (val === 'Opportunity') setOpportunityModalOpen(true);
                            else if (val === 'Rejected') { setRejectedModalSource('SiteVisit'); setRejectedModalOpen(true); }
                            else handleGenericSubmit('siteVisitStatus', val);
                          }}
                        />

                        <div className="nx-tabs" style={{ marginTop: 'var(--nx-space-4)', marginBottom: 'var(--nx-space-3)' }}>
                          {[['Scheduled', 'Scheduled'], ['Confirmed', 'Confirmed'], ['Done', 'Completed']].map(([id, label]) => (
                            <button
                              key={id}
                              type="button"
                              className={`nx-tabs__tab ${siteVisitTab === id ? 'is-active' : ''}`}
                              onClick={() => { siteVisitTabTouchedRef.current = true; setSiteVisitTab(id); }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        <div className="nx-rec-fields nx-rec-fields--1">
                          {siteVisitTab === 'Scheduled' && (
                            <>
                              <RecordField label="Scheduled Date" icon={Calendar} value={recordStamp(lead.siteVisitDate)} readOnly />
                              <RecordField label="Scheduled Note" multiline value={lead.siteVisitNote || ''} placeholder="No note" onSave={(v) => handleGenericSubmit('siteVisitNote', v)} />
                            </>
                          )}
                          {siteVisitTab === 'Confirmed' && (
                            <>
                              <RecordField label="Confirmed Date" icon={Calendar} value={recordStamp(lead.siteVisitConfirmedDate)} readOnly />
                              <RecordField label="Confirmed Note" multiline value={lead.siteVisitConfirmedNote || ''} placeholder="No note" onSave={(v) => handleGenericSubmit('siteVisitConfirmedNote', v)} />
                            </>
                          )}
                          {siteVisitTab === 'Done' && (
                            <>
                              <RecordField label="Done Date" icon={Calendar} value={recordStamp(lead.siteVisitDoneDate)} readOnly />
                              <RecordField label="Done Note" multiline value={lead.siteVisitDoneNote || ''} placeholder="No note" onSave={(v) => handleGenericSubmit('siteVisitDoneNote', v)} />
                            </>
                          )}
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Lead Information sub-tab */}
                  {generalTab === 'Lead Information' && (
                    <div className="nx-rec__grid nx-rec__grid--2">
                      <div className="nx-rec__col">
                        <section className="nx-rec-card">
                          <header className="nx-rec-card__head">
                            <span className="nx-rec-card__icon"><Tag size={16} /></span>
                            <div className="nx-rec-card__titles">
                              <h2 className="nx-rec-card__title">Lead Information</h2>
                              <p className="nx-rec-card__sub">Ownership, rating and status</p>
                            </div>
                          </header>
                          <div className="nx-rec-card__body">
                            <div className="nx-rec-fields nx-rec-fields--1">
                              <div className="nx-rec-field">
                                <span className="nx-rec-field__label">Rating</span>
                                <div className="lp-rating">
                                  {RATINGS.map(({ key, label, icon: RIcon }) => (
                                    <button
                                      key={key}
                                      type="button"
                                      disabled={viewOnly}
                                      className={`lp-rating__btn ${key}${selectedRating === key ? ' is-active' : ''}`}
                                      onClick={() => { setSelectedRating(key); if (key !== savedRating) handleGenericSubmit('rating', key); }}
                                    >
                                      <RIcon size={14} /> {label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <RecordField label="Allocator" icon={User} value={lead.allocator || ''} placeholder="Not allocated" readOnly />
                              <RecordUserField label="Lead Owner" value={lead.owner} users={usersList} options={assignableUsers(usersList)} onSave={changeOwner} saveOnPick />
                              <RecordField label="Follow Up Date" icon={Calendar} type="datetime-local" when="future" value={formatDateForInput(lead.followUpDate)} onSave={(v) => handleGenericSubmit('followUpDate', v)} />
                              <RecordField label="Allocated Date" icon={Calendar} type="datetime-local" when="past" value={formatDateForInput(lead.allocatedDate)} onSave={(v) => handleGenericSubmit('allocatedDate', v)} />
                              {lead.status === 'Rejected' && (
                                <>
                                  <RecordField label="Rejected Reason" value={lead.reasonDetails || ''} placeholder="Not set" onSave={(v) => handleGenericSubmit('reasonDetails', v)} />
                                  <RecordField label="Rejected Reason Subtype" value={lead.rejectionType || ''} placeholder="Not set" onSave={(v) => handleGenericSubmit('rejectionType', v)} />
                                </>
                              )}
                            </div>
                          </div>
                        </section>
                      </div>

                      {/* Where the lead came from, beside what we know about it. */}
                      <div className="nx-rec__col">
                        <section className="nx-rec-card">
                          <header className="nx-rec-card__head">
                            <span className="nx-rec-card__icon"><Globe size={16} /></span>
                            <div className="nx-rec-card__titles">
                              <h2 className="nx-rec-card__title">Source Information</h2>
                              <p className="nx-rec-card__sub">How this lead reached us</p>
                            </div>
                          </header>
                          <div className="nx-rec-card__body">
                            <div className="nx-rec-fields">
                              <RecordLookupField label="Primary Source" apiUrl="/api/primary-sources" value={lead.primarySource} onSave={(v) => handleGenericSubmit('primarySource', v)} />
                              <RecordLookupField label="Secondary Source" apiUrl="/api/secondary-sources" value={lead.secondarySource} onSave={(v) => handleGenericSubmit('secondarySource', v)} />
                              <RecordLookupField label="Tertiary Source" apiUrl="/api/tertiary-sources" value={lead.tertiarySource} onSave={(v) => handleGenericSubmit('tertiarySource', v)} />
                              <RecordField label="Channel Partner Name" icon={Users} value={lead.channelPartnerName || ''} placeholder="Not set" onSave={(v) => handleGenericSubmit('channelPartnerName', v)} />
                              <RecordField label="Channel Partner ID" icon={Tag} value={lead.channelPartnerId || ''} placeholder="Not set" onSave={(v) => handleGenericSubmit('channelPartnerId', v)} />
                              <RecordField label="Source URL" icon={Link2} value={lead.sourceUrl || ''} placeholder="Not set" onSave={(v) => handleGenericSubmit('sourceUrl', v)} />
                              <RecordField label="Referrer Details" multiline full value={lead.referrerDetails || ''} placeholder="Not set" onSave={(v) => handleGenericSubmit('referrerDetails', v)} />
                            </div>
                          </div>
                        </section>
                      </div>
                    </div>
                  )}

                  {/* Attempted Details sub-tab */}
                  {generalTab === 'Attempted' && (
                    <div className="nx-rec__grid nx-rec__grid--1">
                      <div className="nx-rec__col">
                        <section className="nx-rec-card">
                          <header className="nx-rec-card__head">
                            <span className="nx-rec-card__icon"><PhoneCall size={16} /></span>
                            <div className="nx-rec-card__titles">
                              <h2 className="nx-rec-card__title">Attempt Details</h2>
                              <p className="nx-rec-card__sub">How the call went, and when to try again</p>
                            </div>
                          </header>
                          <div className="nx-rec-card__body">
                            <div className="nx-rec-fields nx-rec-fields--1">
                              <RecordField
                                label="Call Status"
                                icon={PhoneCall}
                                options={callStatuses}
                                value={lead.callStatus || ''}
                                placeholder="Not set"
                                onSave={(v) => handleGenericSubmit('callStatus', v)}
                              />
                              <RecordField
                                label="Open Reason"
                                icon={AlertTriangle}
                                options={openReasons}
                                value={lead.openReason || ''}
                                placeholder="Not set"
                                onSave={(v) => handleGenericSubmit('openReason', v)}
                              />
                              <RecordField
                                label="Next Follow Up"
                                icon={Calendar}
                                type="datetime-local"
                                when="future"
                                value={formatDateForInput(lead.followUpDate)}
                                onSave={(v) => handleGenericSubmit('followUpDate', v)}
                              />
                              <RecordField
                                label="Call Remarks"
                                multiline
                                value={lead.callRemarks || ''}
                                placeholder="No remarks"
                                onSave={(v) => handleGenericSubmit('callRemarks', v)}
                              />
                            </div>
                          </div>
                        </section>
                      </div>
                    </div>
                  )}
                </div>
              )
            }

            {
              mainTab === 'Notes' && (
                <section className="nx-rec-card">
                  <header className="nx-rec-card__head">
                    <span className="nx-rec-card__icon"><MessageSquare size={16} /></span>
                    <div className="nx-rec-card__titles">
                      <h2 className="nx-rec-card__title">Notes</h2>
                      <p className="nx-rec-card__sub">Free-text notes captured across the lead's journey</p>
                    </div>
                  </header>
                  <div className="nx-rec-card__body">
                    <div className="nx-rec-fields nx-rec-fields--1">
                      <RecordField label="Call Remarks" multiline value={lead.callRemarks || ''} placeholder="No remarks" onSave={(v) => handleGenericSubmit('callRemarks', v)} />
                      <RecordField label="Other Notes" multiline value={lead.otherNotes || ''} placeholder="No notes" onSave={(v) => handleGenericSubmit('otherNotes', v)} />
                      <RecordField label="Additional Remarks" multiline value={lead.additionalRemarks || ''} placeholder="No remarks" onSave={(v) => handleGenericSubmit('additionalRemarks', v)} />
                      <RecordField label="Site Visit Scheduled Note" multiline value={lead.siteVisitNote || ''} placeholder="No note" onSave={(v) => handleGenericSubmit('siteVisitNote', v)} />
                      <RecordField label="Site Visit Confirmed Note" multiline value={lead.siteVisitConfirmedNote || ''} placeholder="No note" onSave={(v) => handleGenericSubmit('siteVisitConfirmedNote', v)} />
                      <RecordField label="Site Visit Done Note" multiline value={lead.siteVisitDoneNote || ''} placeholder="No note" onSave={(v) => handleGenericSubmit('siteVisitDoneNote', v)} />
                    </div>
                  </div>
                </section>
              )
            }

            {
              mainTab === 'Follow-up' && (
                <section className="nx-rec-card">
                  <header className="nx-rec-card__head">
                    <span className="nx-rec-card__icon"><Clock size={16} /></span>
                    <div className="nx-rec-card__titles">
                      <h2 className="nx-rec-card__title">Follow-ups & Scheduling</h2>
                      <p className="nx-rec-card__sub">Every date scheduled against this lead</p>
                    </div>
                  </header>
                  <div className="nx-rec-card__body">
                    <div className="nx-rec-fields">
                      <RecordField label="Next Follow Up" icon={Calendar} type="datetime-local" when="future" value={formatDateForInput(lead.followUpDate)} onSave={(v) => handleGenericSubmit('followUpDate', v)} />
                      <RecordField label="Allocated Date" icon={Calendar} type="datetime-local" when="past" value={formatDateForInput(lead.allocatedDate)} onSave={(v) => handleGenericSubmit('allocatedDate', v)} />
                      <RecordField label="Virtual Visit Date" icon={Calendar} type="datetime-local" when="future" value={formatDateForInput(lead.virtualVisitDate)} onSave={(v) => handleGenericSubmit('virtualVisitDate', v)} />
                      <RecordField label="Site Visit Scheduled" icon={Calendar} value={recordStamp(lead.siteVisitDate)} readOnly />
                      <RecordField label="Site Visit Confirmed" icon={Calendar} value={recordStamp(lead.siteVisitConfirmedDate)} readOnly />
                      <RecordField label="Site Visit Done" icon={Calendar} value={recordStamp(lead.siteVisitDoneDate)} readOnly />
                    </div>
                  </div>
                </section>
              )
            }

            {mainTab === 'Conversations' && (
              <LeadConversations leadId={lead.id} mobile={lead.mobile} readOnly={allocatorOnly} />
            )}

            {mainTab === 'Documents' && (
              <RecordDocuments entityType="lead" entityId={lead.id} readOnly={allocatorOnly} />
            )}

          </div>{/* end lp-body-wrap__main */}

          {/* ---- Persistent sidebar: shown whichever tab is open ------------- */}
          <div className="lp-body-wrap__side">
            <section className="nx-rec-card">
              <header className="nx-rec-card__head">
                <span className="nx-rec-card__icon"><CheckCircle2 size={16} /></span>
                <div className="nx-rec-card__titles">
                  <h2 className="nx-rec-card__title">Lead Progress</h2>
                  <p className="nx-rec-card__sub">Stage {currentStage + 1} of {PROGRESS_STAGES.length}</p>
                </div>
              </header>
              <div className="nx-rec-card__body">
                <div className="nx-rec-steps">
                  {PROGRESS_STAGES.map((label, i) => (
                    <div
                      key={label}
                      className={`nx-rec-step${i < currentStage ? ' is-done' : ''}${i === currentStage ? ' is-current' : ''}`}
                    >
                      <span className="nx-rec-step__dot">
                        {i < currentStage ? <Check size={14} /> : <Circle size={10} />}
                      </span>
                      <span className="nx-rec-step__label">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="nx-rec-card">
              <header className="nx-rec-card__head">
                <span className="nx-rec-card__icon"><Activity size={16} /></span>
                <div className="nx-rec-card__titles">
                  <h2 className="nx-rec-card__title">Lead Log</h2>
                  <p className="nx-rec-card__sub">{sortedLogs.length} {sortedLogs.length === 1 ? 'entry' : 'entries'}</p>
                </div>
                <Select
                  advanceOnPick={false}
                  className="nx-rec-card__filter-select"
                  size="sm"
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  aria-label="Filter the lead log"
                >
                  <option value="all">All Activities</option>
                  {logTitles.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </header>
              <div className="nx-rec-card__body">{renderLogList()}</div>
            </section>
          </div>
        </div>{/* end lp-body-wrap */}

        {
          rejectedModalOpen && (
            <div className="modal-overlay">
              <div className="modal-content attempted-modal">
                <div className="modal-header">
                  <h3>Rejected Reason</h3>
                  {/* Closing used to put a status dropdown back where it was.
                    That dropdown is gone, so there is nothing to restore. */}
                  <button className="btn-close" onClick={() => setRejectedModalOpen(false)}>&times;</button>
                </div>
                <form onSubmit={handleRejectedSubmit}>
                  <div className="modal-body">
                    <div className="form-group">
                      <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: 'var(--text-muted)', fontSize: '13px' }}>Rejected Reason :</label>
                      <textarea
                        className="modal-input form-textarea"
                        placeholder="Reject Reason"
                        style={{ borderStyle: 'solid' }}
                        value={rejectedFormData.rejectedReason}
                        onChange={(e) => setRejectedFormData({ rejectedReason: e.target.value })}
                        required
                      ></textarea>
                    </div>
                  </div>
                  <div className="modal-footer" style={{ paddingRight: '20px', paddingBottom: '20px' }}>
                    <button type="submit" className="btn-submit-modal" disabled={isSubmitting}>
                      {isSubmitting ? 'Submitting...' : 'Submit'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )
        }




        {
          reScheduledModalOpen && (
            <div className="modal-overlay">
              <div className="modal-content attempted-modal">
                <div className="modal-header">
                  <h3>Re Scheduled Site Visit</h3>
                  <button className="btn-close" onClick={() => setReScheduledModalOpen(false)}>&times;</button>
                </div>
                <form onSubmit={handleReScheduledSubmit}>
                  <div className="modal-body">
                    <div className="form-group">
                      <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: 'var(--text-muted)', fontSize: '13px' }}>Site Visit Scheduled Date :</label>
                      <input
                        type="datetime-local"
                        {...boundsFor('future')}
                        className="modal-input"
                        style={{ borderStyle: 'solid' }}
                        value={reScheduledFormData.siteVisitDate}
                        onChange={(e) => setReScheduledFormData({ ...reScheduledFormData, siteVisitDate: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: 'var(--text-muted)', fontSize: '13px' }}>Note</label>
                      <textarea
                        className="modal-input form-textarea"
                        placeholder="Note"
                        style={{ borderStyle: 'solid' }}
                        value={reScheduledFormData.siteVisitNote}
                        onChange={(e) => setReScheduledFormData({ ...reScheduledFormData, siteVisitNote: e.target.value })}
                      ></textarea>
                    </div>
                  </div>
                  <div className="modal-footer" style={{ paddingRight: '20px', paddingBottom: '20px' }}>
                    <button type="submit" className="btn-submit-modal">edit lead</button>
                  </div>
                </form>
              </div>
            </div>
          )
        }

        {
          confirmedModalOpen && (
            <div className="modal-overlay">
              <div className="modal-content attempted-modal">
                <div className="modal-header">
                  <h3>Site Visit Confirmed</h3>
                  <button className="btn-close" onClick={() => setConfirmedModalOpen(false)}>&times;</button>
                </div>
                <form onSubmit={handleConfirmedSubmit}>
                  <div className="modal-body">
                    <div className="form-group">
                      <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: 'var(--text-muted)', fontSize: '13px' }}>Site Visit Confirm Date :</label>
                      <input
                        type="datetime-local"
                        {...boundsFor('future')}
                        className="modal-input"
                        style={{ borderStyle: 'solid' }}
                        value={confirmedFormData.siteVisitConfirmedDate}
                        onChange={(e) => setConfirmedFormData({ ...confirmedFormData, siteVisitConfirmedDate: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: 'var(--text-muted)', fontSize: '13px' }}>Note</label>
                      <textarea
                        className="modal-input form-textarea"
                        placeholder="Note"
                        style={{ borderStyle: 'solid' }}
                        value={confirmedFormData.siteVisitConfirmedNote}
                        onChange={(e) => setConfirmedFormData({ ...confirmedFormData, siteVisitConfirmedNote: e.target.value })}
                      ></textarea>
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: 'var(--text-muted)', fontSize: '13px' }}>Lead Owner :</label>
                      <Select
                        value={confirmedFormData.leadOwner}
                        onChange={(e) => setConfirmedFormData({ ...confirmedFormData, leadOwner: e.target.value })}
                      >
                        <option value="">Select Owner</option>
                        {assignableUsers(usersList).map(u => (
                          <option key={u.id} value={u.username || u.id}>
                            {u.username || u.id} - {u.firstName || u.name || 'User'} {u.lastName || ''}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  <div className="modal-footer" style={{ paddingRight: '20px', paddingBottom: '20px' }}>
                    <button type="submit" className="btn-submit-modal">Submit</button>
                  </div>
                </form>
              </div>
            </div>
          )
        }

        {
          doneModalOpen && (
            <div className="modal-overlay">
              <div className="modal-content attempted-modal">
                <div className="modal-header">
                  <h3>Site Visit Done</h3>
                  <button className="btn-close" onClick={() => setDoneModalOpen(false)}>&times;</button>
                </div>
                <form onSubmit={handleDoneSubmit}>
                  <div className="modal-body">
                    <div className="form-group">
                      <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: 'var(--text-muted)', fontSize: '13px' }}>Site Visit Done Date :</label>
                      <input
                        type="datetime-local"
                        {...boundsFor('past')}
                        className="modal-input"
                        style={{ borderStyle: 'solid' }}
                        value={doneFormData.siteVisitDoneDate}
                        onChange={(e) => setDoneFormData({ ...doneFormData, siteVisitDoneDate: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ marginBottom: '10px', display: 'block', color: 'var(--text-muted)', fontSize: '13px' }}>Note</label>
                      <textarea
                        className="modal-input form-textarea"
                        placeholder="Note"
                        style={{ borderStyle: 'solid' }}
                        value={doneFormData.siteVisitDoneNote}
                        onChange={(e) => setDoneFormData({ ...doneFormData, siteVisitDoneNote: e.target.value })}
                      ></textarea>
                    </div>
                  </div>
                  <div className="modal-footer" style={{ paddingRight: '20px', paddingBottom: '20px' }}>
                    <button type="submit" className="btn-submit-modal">Submit</button>
                  </div>
                </form>
              </div>
            </div>
          )
        }

        {
          opportunityModalOpen && (
            <div className="modal-overlay">
              <div className="modal-content attempted-modal">
                <div className="modal-header">
                  <h3>Are you sure, this lead will be converted to opportunity now?</h3>
                  <button className="btn-close" onClick={() => setOpportunityModalOpen(false)}>&times;</button>
                </div>
                <form onSubmit={handleOpportunitySubmit}>
                  <div className="modal-body">
                    <div className="form-group">
                      <label
                        className="form-label"
                        style={{
                          marginBottom: "10px",
                          display: "block",
                          color: 'var(--text-muted)',
                          fontSize: "13px",
                        }}
                      >
                        Booking Status :
                      </label>

                      <Select
                        value={opportunityFormData.bookingStatus}
                        onChange={(e) =>
                          setOpportunityFormData({
                            ...opportunityFormData,
                            bookingStatus: e.target.value,
                          })
                        }
                        required
                      >
                        <option value="">Select Booking Status</option>
                        <option value="Initiate">Initiate</option>
                        <option value="Booking Done">Booking Done</option>
                      </Select>
                    </div>
                    {/* A hidden LeadsId input used to sit here, reading a field
                    this form's state never had. It was always undefined, and
                    the handler takes the id from the route anyway. */}
                  </div>

                  <div
                    className="modal-footer"
                    style={{ paddingRight: "20px", paddingBottom: "20px" }}
                  >
                    <button type="submit" className="btn-submit-modal">
                      Submit
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )
        }

        {/* Toast Notification */}
        {
          toast.visible && (
            <div className={`leads-toast leads-toast-${toast.type}`}>
              <div className="leads-toast-icon">
                {toast.type === 'success' && <Check size={20} />}
                {toast.type === 'duplicate' && <AlertTriangle size={20} />}
                {toast.type === 'error' && <X size={20} />}
              </div>
              <span className="leads-toast-message">{toast.message}</span>
              <button className="leads-toast-close" onClick={() => setToast({ visible: false, type: '', message: '' })}>
                <X size={16} />
              </button>
            </div>
          )
        }

      </div >
    </RecordViewOnly>
  );
}
