import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useRecordTitle } from './hooks/usePageMeta';
import { Activity, Briefcase, FileText, Globe, Receipt, User } from 'lucide-react';
import './OpportunityProfile.css';
import invalidateLeadCache from './utils/invalidateLeadCache';
import OpportunityHealth from './opportunity/OpportunityHealth';
import useLiveRefresh from './utils/useLiveRefresh';
import { assignableUsers } from './utils/currentUser';
import {
  emailError, normalizeEmail,
  RecordCard, RecordColumn, RecordField, RecordFields, RecordGrid, RecordPage,
  RecordPhoneField, RecordTimeline, recordStamp, toDateInput,
} from './ui';

/**
 * The page's tabs.
 *
 * Source Information and Agreement sat in a strip of their own beneath the
 * main cards, which were always on screen — so the page was half tabbed and
 * half not, and the strip was easy to miss below the fold. One strip at the
 * top now covers the whole record.
 */
const OPP_TABS = [
  { key: 'General Info', icon: User },
  { key: 'Opportunity Info', icon: Briefcase },
  { key: 'Agreement & Invoice Details', icon: FileText },
];

/**
 * In the order an opportunity moves through them.
 *
 * "Site Visit Converted" is the schema default; "Initiate" and "Booking Done"
 * are what converting a lead writes here — the booking status chosen in that
 * dialog becomes the stage. They were missing, so every converted opportunity
 * showed a stage its own dropdown could not offer back.
 */
const STAGES = [
  'Site Visit Converted', 'Initiate', 'Booking Done',
  'Negotiation', 'Closed Won', 'Closed Lost',
];
const UNIT_TYPES = ['Flat', 'Villa', 'Plot'];
const PAYMENT_STATUSES = ['Fully Paid', 'Partially Paid'];
const AGREEMENT_STATUSES = ['Draft', 'Sent to Customer', 'Signed', 'Registered', 'Cancelled'];
const PAYMENT_MODES = ['Bank Transfer', 'UPI', 'Cheque', 'Cash', 'Home Loan', 'Card'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const PIPELINES = ['Sales', 'Channel Partner', 'Referral'];
const OPPORTUNITY_TYPES = ['New Business', 'Upgrade', 'Resale', 'Rental', 'Investment'];
/* 0-100 in steps, rather than a free number: a forecast built from 63% and 67%
   is not more accurate than one built from 60% and 70%, only harder to read. */
const PROBABILITIES = ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100'];

/**
 * What is still owed.
 *
 * Worked out from the invoice and what has been paid rather than stored, so it
 * cannot drift out of step with the two figures it comes from. Amounts are
 * free text on this model, so anything unparseable reads as blank rather than
 * as a confident wrong number.
 */
function outstanding(invoiced, paid) {
  const num = (v) => {
    const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const a = num(invoiced);
  const b = num(paid);
  if (a === null) return '';
  const left = a - (b ?? 0);
  return left.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export default function OpportunityProfile() {
  const { id } = useParams();
  const [opportunity, setOpportunity] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // The tab says which record is open, not just which kind.
  useRecordTitle(opportunity?.opportunityName);
  const [activeTab, setActiveTab] = useState('General Info');
  const [projectNames, setProjectNames] = useState([]);
  const [usersList, setUsersList] = useState([]);

  // The project list drives the Leads Project dropdown, so it is fetched
  // once rather than per edit.
  useEffect(() => {
    fetch('/api/projects')
      .then(r => (r.ok ? r.json() : []))
      .then(data => setProjectNames(Array.isArray(data) ? data.map(p => p.projectName).filter(Boolean) : []))
      .catch(err => console.error('Failed to fetch projects:', err));

    fetch('/api/users')
      .then(r => (r.ok ? r.json() : []))
      .then(data => setUsersList(Array.isArray(data) ? data : []))
      .catch(err => console.error('Failed to fetch users:', err));
  }, []);

  const fetchOpportunity = useCallback(async () => {
    try {
      const response = await fetch(`/api/opportunities/${id}`);
      if (response.ok) {
        const data = await response.json();
        setOpportunity(data);
      }
    } catch (error) {
      console.error('Failed to fetch opportunity:', error);
    }
  }, [id]);

  /* The derived figures — weighted value, score, days in stage — are worked out
     on the server so the record, the list and the dashboard cannot each reach a
     different answer. Re-read after every save, since a change to the value or
     the stage changes most of them. */
  const fetchSummary = useCallback(async () => {
    try {
      const response = await fetch(`/api/opportunities/${id}/summary`);
      if (response.ok) setSummary(await response.json());
    } catch (error) {
      console.error('Failed to fetch the opportunity summary:', error);
    } finally {
      setSummaryLoading(false);
    }
  }, [id]);

  /* Below the two callbacks on purpose: a dependency array is evaluated during
     render, so naming a `const` declared further down throws on first paint. */
  useEffect(() => {
    fetchOpportunity();
    fetchSummary();
  }, [fetchOpportunity, fetchSummary]);

  /* The summary figures are derived on the server from this record and the
     lead behind it, so a change on either side has to be re-read rather than
     recomputed here. */
  useLiveRefresh(['opportunities', 'leads'], () => {
    fetchOpportunity();
    fetchSummary();
  });

  /* The log is written by the server, which knows who is signed in and what
     the value was before. This used to compose its own entry with the actor
     hardcoded to "admin", so every change was attributed to admin whoever made
     it — and once the server started logging too, twice over. */
  const handleUpdates = async (updates) => {
    try {
      const response = await fetch(`/api/opportunities/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (response.ok) {
        fetchOpportunity();
        fetchSummary();
        invalidateLeadCache();
      }
    } catch (error) {
      console.error('Failed to update field:', error);
    }
  };

  const save = (name) => (value) => handleUpdates(
    { [name]: value },
    name.replace(/([A-Z])/g, ' $1').trim().replace(/^./, str => str.toUpperCase()),
    value
  );

  const savePhone = (numKey, codeKey, label) => (num, code) => handleUpdates(
    { [numKey]: num, [codeKey]: code },
    label,
    num
  );

  if (!opportunity) return <div className="nx-rec__loading">Loading…</div>;

  const stored = (opportunity.logs || []).map((l) => ({
    id: l.id,
    title: l.title,
    subtitle: l.subtitle,
    date: recordStamp(l.date || l.createdAt),
    icon: Activity,
  }));

  /* The conversion is a real log row now, written when the opportunity is
     created, so it arrives with the rest and carries its actor and its opening
     stage. Records converted before that have no such row, and for those the
     opening line is still worked out from the record itself — without it their
     history would simply begin nowhere. It names createdBy when there is one
     rather than asserting a person, since the old rows do not know who. */
  const hasOpeningRow = stored.some((l) => l.title === 'Lead To Opportunity');

  const logEntries = hasOpeningRow ? stored : [
    ...stored,
    {
      id: 'created',
      title: 'Lead To Opportunity',
      subtitle: opportunity.createdBy
        ? `by ${opportunity.createdBy}`
        : 'converted from a lead',
      date: recordStamp(opportunity.createdAt),
      icon: Activity,
    },
  ];

  // The project master may not contain what an older record stored, so keep
  // that value in the list rather than silently blanking it.
  const projectOptions = opportunity.LeadsProject && !projectNames.includes(opportunity.LeadsProject)
    ? [opportunity.LeadsProject, ...projectNames]
    : projectNames;

  return (
    <RecordPage
      crumbs={[{ label: 'Opportunities', to: '/opportunities' }]}
      title={opportunity.opportunityName || 'Opportunity'}
      backTo="/opportunities"
      backLabel="Back to Opportunities"
      tabs={OPP_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--nx-text-secondary)', whiteSpace: 'nowrap' }}>Stage :</span>
          <select
            className="nx-rec-card__filter"
            value={opportunity.stage || ''}
            onChange={(e) => save('stage')(e.target.value)}
            style={{ margin: 0, height: '32px', minWidth: '130px' }}
          >
            {!opportunity.stage && <option value="" disabled>Select</option>}
            {opportunity.stage && !STAGES.includes(opportunity.stage) && (
              <option value={opportunity.stage}>{opportunity.stage}</option>
            )}
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      }
    >
      {/* True of the whole opportunity, so it does not belong to one tab. */}
      <OpportunityHealth summary={summary} loading={summaryLoading} />

      <div className="nx-rec__body">
        <div className="nx-rec__body-main">
          {activeTab === 'General Info' && (
            <>
              <RecordCard icon={User} title="General Info">
                <RecordFields cols={2}>
                  <RecordField label="Opportunity Id :" value={opportunity.oppId} readOnly />
                  <RecordField label="Opportunity Name :" value={opportunity.opportunityName} onSave={save('opportunityName')} />
                  <RecordPhoneField
                    label="Mobile Number :"
                    name="mobileNumber"
                    value={opportunity.mobileNumber}
                    dial={opportunity.mobileCountryCode}
                    onSave={savePhone('mobileNumber', 'mobileCountryCode', 'Mobile Number')}
                  />
                  <RecordField
                    label="Email Address :"
                    type="email"
                    value={opportunity.emailAddress}
                    normalize={normalizeEmail}
                    validate={(v) => emailError(v, { label: 'Email Address' })}
                    onSave={save('emailAddress')}
                  />
                  <RecordField label="Leads Project :" options={projectOptions} value={opportunity.LeadsProject} onSave={save('LeadsProject')} />
                  <RecordPhoneField
                    label="Alternate Mobile No. :"
                    name="alternateMobile"
                    value={opportunity.alternateMobile}
                    dial={opportunity.alternateMobileCountryCode}
                    onSave={savePhone('alternateMobile', 'alternateMobileCountryCode', 'Alternate Mobile')}
                  />
                  <RecordField
                    label="Alternate Email :"
                    type="email"
                    value={opportunity.alternateEmail}
                    normalize={normalizeEmail}
                    validate={(v) => emailError(v, { label: 'Alternate Email' })}
                    onSave={save('alternateEmail')}
                  />
                  <RecordField label="Occupation :" value={opportunity.occupation} onSave={save('occupation')} />
                  <RecordField label="Company Name :" value={opportunity.companyName} onSave={save('companyName')} />
                </RecordFields>
              </RecordCard>
              <RecordGrid cols={2}>
                <RecordColumn>
                  <RecordCard icon={Globe} title="Source Information">
                    <RecordFields cols={1}>
                      <RecordField label="Preferred Budget :" value={opportunity.preferredBudget} onSave={save('preferredBudget')} />
                      <RecordField label="Preferred Locality :" value={opportunity.preferredLocality} onSave={save('preferredLocality')} />
                      <RecordField label="Location Commission :" value={opportunity.locationCommission} onSave={save('locationCommission')} />
                    </RecordFields>
                  </RecordCard>
                </RecordColumn>
                <RecordColumn>
                  <RecordCard icon={Briefcase} title="Channel Partner">
                    <RecordFields cols={1}>
                      <RecordField label="Channel Partner Name :" value={opportunity.channelPartnerName} onSave={save('channelPartnerName')} />
                      <RecordField label="Channel Partner ID :" value={opportunity.channelPartnerId} onSave={save('channelPartnerId')} />
                      <RecordField label="Location Commission (INR) :" value={opportunity.locationCommissionInr} onSave={save('locationCommissionInr')} />
                    </RecordFields>
                  </RecordCard>
                </RecordColumn>
              </RecordGrid>
            </>
          )}

          {activeTab === 'Opportunity Info' && (
            <RecordCard icon={Briefcase} title="Opportunity Info">
              <RecordFields cols={2}>
                {/* Who allocated the opportunity is a record of what happened,
                not a setting — editing it would rewrite history. */}
                {/* Blank when nobody is recorded. It used to read "admin",
                    which on a read-only field is the record asserting
                    something untrue rather than offering a default. */}
                <RecordField
                  label="Allocator :"
                  value={opportunity.allocator || ''}
                  placeholder="Not allocated"
                  readOnly
                />
                <RecordField
                  label="Opportunity Owner :"
                  options={assignableUsers(usersList).map(u => ({ value: u.id || u.username, label: u.username || u.id }))}
                  value={opportunity.opportunityOwner}
                  onSave={save('opportunityOwner')}
                />
                <RecordField label="Status :" options={['Open', 'Won', 'Lost', 'On Hold']} value={opportunity.status} onSave={save('status')} />
                <RecordField label="Probability (%) :" options={PROBABILITIES} value={opportunity.probability == null ? '' : String(opportunity.probability)} onSave={save('probability')} />
                <RecordField label="Expected Value :" value={opportunity.expectedValue ?? ''} onSave={save('expectedValue')} />
                <RecordField label="Expected Close Date :" type="date" value={toDateInput(opportunity.expectedCloseDate)} onSave={save('expectedCloseDate')} />
                <RecordField label="Priority :" options={PRIORITIES} value={opportunity.priority} onSave={save('priority')} />
                <RecordField label="Pipeline :" options={PIPELINES} value={opportunity.pipeline} onSave={save('pipeline')} />
                <RecordField label="Opportunity Type :" options={OPPORTUNITY_TYPES} value={opportunity.opportunityType} onSave={save('opportunityType')} />
                <RecordField label="Industry :" value={opportunity.industry} onSave={save('industry')} />
                <RecordField label="Next Action :" value={opportunity.nextAction} onSave={save('nextAction')} />
                <RecordField label="Next Follow-up :" type="date" value={toDateInput(opportunity.nextFollowUpDate)} onSave={save('nextFollowUpDate')} />
                <RecordField label="Description :" multiline full value={opportunity.description} onSave={save('description')} />
                <RecordField label="Selected Unit :" value={opportunity.selectedUnit} onSave={save('selectedUnit')} />
                <RecordField label="Unit Type :" options={UNIT_TYPES} value={opportunity.unitType} onSave={save('unitType')} />
                <RecordField label="Booking Date :" type="date" value={toDateInput(opportunity.bookingDate)} onSave={save('bookingDate')} />
                <RecordField label="Booking Details :" value={opportunity.bookingDetails} onSave={save('bookingDetails')} />
                <RecordField label="Booking Amount :" value={opportunity.bookingAmount} onSave={save('bookingAmount')} />
                <RecordField label="Booking Amount Status :" options={PAYMENT_STATUSES} value={opportunity.bookingAmountStatus} onSave={save('bookingAmountStatus')} />
                <RecordField label="Booking Done Date :" type="date" value={toDateInput(opportunity.bookingDoneDate)} onSave={save('bookingDoneDate')} />
                <RecordField label="Comments :" value={opportunity.comments} onSave={save('comments')} />
                <RecordField
                  label="Reporting Manager :"
                  options={[
                    { value: '', label: 'Select' },
                    ...assignableUsers(usersList).map(u => ({ value: u.id || u.username, label: u.username || u.id }))
                  ]}
                  value={opportunity.reportingManager}
                  onSave={save('reportingManager')}
                />
                <RecordField label="CP Commission % :" value={opportunity.cpCommissionPercent} onSave={save('cpCommissionPercent')} />
                <RecordField label="Approval Stage :" value={opportunity.approvalStage} onSave={save('approvalStage')} />
              </RecordFields>
            </RecordCard>
          )}



          {activeTab === 'Agreement & Invoice Details' && (
            <RecordGrid cols={2}>
              <RecordColumn>
                <RecordCard icon={FileText} title="Agreement">
                  <RecordFields cols={1}>
                    <RecordField label="Agreement Number :" value={opportunity.agreementNumber} onSave={save('agreementNumber')} />
                    <RecordField label="Agreement Status :" options={AGREEMENT_STATUSES} value={opportunity.agreementStatus} onSave={save('agreementStatus')} />
                    <RecordField label="Agreement Value :" value={opportunity.agreementValue} onSave={save('agreementValue')} />
                    <RecordField label="Agreement Date :" type="date" value={toDateInput(opportunity.agreementDate)} onSave={save('agreementDate')} />
                    <RecordField label="Registration Date :" type="date" value={toDateInput(opportunity.registrationDate)} onSave={save('registrationDate')} />
                    <RecordField label="Notes :" multiline value={opportunity.agreementNotes} onSave={save('agreementNotes')} />
                  </RecordFields>
                </RecordCard>
              </RecordColumn>

              <RecordColumn>
                <RecordCard icon={Receipt} title="Invoice & Payment">
                  <RecordFields cols={1}>
                    <RecordField label="Invoice Number :" value={opportunity.invoiceNumber} onSave={save('invoiceNumber')} />
                    <RecordField label="Invoice Date :" type="date" value={toDateInput(opportunity.invoiceDate)} onSave={save('invoiceDate')} />
                    <RecordField label="Invoice Amount :" value={opportunity.invoiceAmount} onSave={save('invoiceAmount')} />
                    <RecordField label="Amount Paid :" value={opportunity.amountPaid} onSave={save('amountPaid')} />
                    {/* Read-only: it is the other two subtracted, not a third
                      number somebody has to keep in step by hand. */}
                    <RecordField
                      label="Balance :"
                      value={outstanding(opportunity.invoiceAmount, opportunity.amountPaid)}
                      placeholder="Enter an invoice amount"
                      readOnly
                    />
                    <RecordField label="Payment Status :" options={PAYMENT_STATUSES} value={opportunity.bookingAmountStatus} onSave={save('bookingAmountStatus')} />
                    <RecordField label="Payment Mode :" options={PAYMENT_MODES} value={opportunity.paymentMode} onSave={save('paymentMode')} />
                    <RecordField label="Next Due Date :" type="date" value={toDateInput(opportunity.nextDueDate)} onSave={save('nextDueDate')} />
                  </RecordFields>
                </RecordCard>
              </RecordColumn>
            </RecordGrid>
          )}
        </div>

        {/* Belongs to the whole record, not to one tab, so it stays put. */}
        <aside className="nx-rec__body-side">
          <RecordCard icon={Activity} title="Opp Log">
            <RecordTimeline entries={logEntries} emptyMessage="No logs available." />
          </RecordCard>
        </aside>
      </div>
    </RecordPage>
  );
}
