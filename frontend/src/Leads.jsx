import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { Plus, Upload } from 'lucide-react';
import { useListData } from './components/Leads';
import DynamicDropdown from './components/DynamicDropdown';
import invalidateLeadCache, { subscribeLeadCacheInvalidation } from './utils/invalidateLeadCache';
import formatMobile from './utils/formatMobile';
import DocumentPreview from './components/DocumentPreview';
import { Button, countryFor, DataTable, DEFAULT_DIAL, emailError, Field, FormGrid, Input, Modal, Page, PhoneInput, RowActions, normalizeEmail, toast, validateNumber } from './ui';
import usePagePermissions from './hooks/usePagePermissions';
import LeadStatusCell from './components/LeadStatusCell';
import FollowUpCountdown from './components/FollowUpCountdown';
import { duplicateMessage, duplicateTitle } from './utils/duplicateMessage';
import './Leads.css';

/* The active tab lives in the URL so it survives a refresh, and so the
   existing /duplicate-leads, /rejected-leads, /site-visits and
   /follow-up-leads redirects land on the right tab. */
const TAB_SLUGS = {
  'All Leads': 'all',
  All: 'all',
  'Our Leads': 'our',
  'Duplicate Leads': 'duplicate',
  'Rejected Leads': 'rejected',
  'Site Visit': 'site-visit',
  'Follow Up': 'follow-up',
};

const ownerOf = (lead) => lead.ownerName || lead.owner || '';

/**
 * Statuses that have a tab to themselves.
 *
 * A lead in one of these is shown only there, so every lead sits in exactly
 * one place and the tab counts add up to the total.
 */
const DEDICATED_TAB = {
  'Site Visit': 'Site Visit',
  Duplicate: 'Duplicate Leads',
  // A likely repeat belongs with the settled ones: both need a look before
  // anybody calls, and that is what the tab is for.
  'Possible Duplicate': 'Duplicate Leads',
  Rejected: 'Rejected Leads',
};

export default function Leads() {
  const navigate = useNavigate();
  const context = useOutletContext();
  const loggedInUser = localStorage.getItem('loggedInUser') || '';
  // Gated by this user's own permissions. See usePagePermissions.
  const { canCreate, canEdit, canDelete, canExport } = usePagePermissions('leads');
  const userRole = context?.userRole || '';
  const isEmployeeLevel = userRole === 'User';
  const isSuperAdmin = loggedInUser === 'admin';


  /* Duplicate Leads stays restricted to the super admin, as it always has. */
  const tabNames = useMemo(() => {
    const all = isEmployeeLevel
      ? ['All', 'Duplicate Leads', 'Rejected Leads', 'Site Visit', 'Follow Up']
      : ['All Leads', 'Our Leads', 'Duplicate Leads', 'Rejected Leads', 'Site Visit', 'Follow Up'];
    return all.filter(tab => tab !== 'Duplicate Leads' || isSuperAdmin);
  }, [isEmployeeLevel, isSuperAdmin]);

  const [searchParams, setSearchParams] = useSearchParams();

  const tabFromUrl = useMemo(() => {
    const slug = searchParams.get('tab');
    if (!slug) return null;
    return tabNames.find(tab => TAB_SLUGS[tab] === slug) || null;
  }, [searchParams, tabNames]);

  const [activeTab, setActiveTab] = useState(() => tabFromUrl || tabNames[0]);
  const [serverFilters, setServerFilters] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mobile, setMobile] = useState('');
  const [mobileDial, setMobileDial] = useState(DEFAULT_DIAL);
  const [email, setEmail] = useState('');
  // The lead whose document is on screen, or null.
  const [previewLead, setPreviewLead] = useState(null);

  /* Server-side filters are part of the request, so the fetcher depends on
     them; useListData refetches whenever this identity changes. */
  const fetchLeadsRequest = useCallback(async () => {
    const params = new URLSearchParams({ username: loggedInUser });
    ['project', 'primarySource', 'status', 'owner'].forEach((key) => {
      if (serverFilters[key]) params.set(key, serverFilters[key]);
    });
    const response = await fetch(`/api/leads?${params.toString()}`);
    if (!response.ok) throw new Error(`Failed to fetch leads (${response.status})`);
    return response.json();
  }, [loggedInUser, serverFilters]);

  const {
    rows: leadsData,
    setRows: setLeadsData,
    loading,
    refresh: fetchLeads,
  } = useListData(fetchLeadsRequest);

  // Keep this list in sync with every other view after any lead mutation.
  useEffect(() => {
    const unsubscribe = subscribeLeadCacheInvalidation(() => fetchLeads());
    return unsubscribe;
  }, [fetchLeads]);

  useEffect(() => {
    if (!tabNames.includes(activeTab)) setActiveTab(tabNames[0] || 'All Leads');
  }, [tabNames, activeTab]);

  /* Follow the URL when it changes from outside the tab strip — a refresh,
     the back button, or one of the /site-visits style redirects. */
  useEffect(() => {
    if (tabFromUrl && tabFromUrl !== activeTab) setActiveTab(tabFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFromUrl]);

  /* ---- tab slicing ------------------------------------------------------ */
  const matchesTab = useCallback((lead, tab) => {
    /* A lead with a tab of its own belongs there and nowhere else.
       These were appearing in All Leads as well, so the same record could be
       worked from two places and the tab counts double-counted it.

       The check that the tab is actually on show matters: Duplicate Leads is
       super-admin only, and without it a duplicate would belong to a tab
       nobody else can see — vanishing from the list entirely. */
    const ownTab = DEDICATED_TAB[lead.status];
    if (ownTab && tabNames.includes(ownTab)) return tab === ownTab;

    switch (tab) {
      case 'All Leads':
      case 'All': return true;
      case 'Our Leads': return ownerOf(lead) === loggedInUser;
      case 'Duplicate Leads':
        return lead.status === 'Duplicate' || lead.status === 'Possible Duplicate';
      case 'Rejected Leads': return lead.status === 'Rejected';
      case 'Site Visit': return lead.status === 'Site Visit';
      case 'Follow Up': return Boolean(lead.followUpDate);
      default: return true;
    }
  }, [loggedInUser, tabNames]);

  const tabs = useMemo(() => tabNames.map(name => ({
    id: name,
    label: name,
    count: leadsData.filter(l => matchesTab(l, name)).length,
  })), [tabNames, leadsData, matchesTab]);

  const rows = useMemo(
    () => leadsData.filter(l => matchesTab(l, activeTab)),
    [leadsData, activeTab, matchesTab]
  );

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    const slug = TAB_SLUGS[tab];
    const next = new URLSearchParams(searchParams);
    if (!slug || slug === 'all') next.delete('tab');
    else next.set('tab', slug);
    setSearchParams(next, { replace: true });
  };

  /**
   * The tab a freshly created lead will actually be visible on.
   *
   * A repeat goes to Duplicate Leads, everything else to the first tab. When
   * that dedicated tab is hidden — Duplicate Leads is super-admin only — the
   * first tab is right anyway, because that is where matchesTab puts it.
   */
  const tabForNewLead = (lead) => {
    const own = DEDICATED_TAB[lead.status];
    return own && tabNames.includes(own) ? own : tabNames[0];
  };

  /* ---- filters ---------------------------------------------------------- */
  const filterFields = useMemo(() => {
    const unique = (getValue) => [...new Set(leadsData.map(getValue).filter(Boolean))].sort();
    return [
      { key: 'project', label: 'Project', placeholder: 'All Projects', options: unique(l => l.project) },
      { key: 'primarySource', label: 'Primary Source', placeholder: 'All Sources', options: unique(l => l.primarySource) },
      { key: 'status', label: 'Status', placeholder: 'All Status', options: unique(l => l.status) },
      { key: 'owner', label: 'Owner', placeholder: 'All Owners', options: unique(ownerOf), getValue: ownerOf },
    ];
  }, [leadsData]);

  // Only re-fetch when a value actually changed — the table reports on mount too.
  const handleFiltersChange = useCallback((values) => {
    setServerFilters((prev) => {
      const keys = ['project', 'primarySource', 'status', 'owner'];
      const changed = keys.some(k => (prev[k] || '') !== (values[k] || ''));
      return changed ? { ...values } : prev;
    });
  }, []);

  /* ---- mutations -------------------------------------------------------- */
  const handleDeleteSelected = async (ids, clearSelection) => {
    if (!await window.appConfirm(`Are you sure you want to delete ${ids.length} selected lead(s)?`)) return;
    try {
      const responses = await Promise.all(
        ids.map(id => fetch(`/api/leads/${id}`, { method: 'DELETE' }))
      );
      clearSelection();
      fetchLeads();
      invalidateLeadCache();
      const failed = responses.filter(r => !r.ok).length;
      if (failed > 0) toast.error(`${failed} of ${ids.length} lead(s) could not be deleted.`);
      else toast.success('Selected leads deleted.');
    } catch {
      toast.error('Failed to delete selected leads.');
    }
  };

  /* ---- columns ---------------------------------------------------------- */
  const columns = useMemo(() => ([
    {
      key: 'name',
      label: 'Company Name',
      render: l => <span className="nx-page__strong">{l.companyName || l.name || '—'}</span>,
      exportValue: l => l.companyName || l.name || '',
    },
    {
      key: 'mobile',
      label: 'Contact',
      width: '190px',
      render: l => (
        <div>
          <div>{formatMobile(l.mobileNumber || l.mobile)}</div>
          {l.email && <div className="nx-page__muted nx-leads__email">{l.email}</div>}
        </div>
      ),
      exportValue: l => l.mobileNumber || l.mobile || '',
    },
    { key: 'primarySource', label: 'Source', width: '160px' },
    { key: 'project', label: 'Projects', width: '180px' },
    {
      key: 'owner',
      label: 'Owner',
      width: '150px',
      render: l => ownerOf(l) || '—',
      exportValue: ownerOf,
    },
    {
      key: 'status',
      label: 'Status',
      width: '170px',
      // Editable in place — see LeadStatusCell.
      render: l => <LeadStatusCell lead={l} onChanged={fetchLeads} />,
      exportValue: l => l.status || '',
    },
    {
      key: 'followUp',
      label: 'Response',
      width: '120px',
      /* A bare countdown is a mystery number. This says what it is counting
         down to, on hover over the column heading. */
      description: 'Time left for the assigned owner to update this lead. '
        + 'If it runs out, the lead is reassigned automatically to the next '
        + 'user on the project round-robin.',
      /* Only the leads actually waiting on someone show anything here, which
         is what makes the column scannable: a run of blanks with two clocks
         in it reads instantly. */
      render: l => (l.followUp
        ? <FollowUpCountdown followUp={l.followUp} compact />
        : <span style={{ color: 'var(--nx-text-muted)' }}>—</span>),
      // The export wants the deadline, not a countdown frozen at export time.
      exportValue: l => (l.followUp?.dueAt ? new Date(l.followUp.dueAt).toLocaleString() : ''),
    },
  ]), [fetchLeads]);

  /* ---- create ----------------------------------------------------------- */
  const handleCreate = async (e) => {
    e.preventDefault();
    const badEmail = emailError(email, { required: true, label: 'Email address' });
    if (badEmail) { toast.error(badEmail); return; }
    const phoneError = validateNumber(mobile, mobileDial);
    if (phoneError) { toast.error(phoneError); return; }
    setIsSubmitting(true);
    try {
      const fd = new FormData(e.target);
      const primarySource = fd.get('primarySource') || '';
      const payload = {
        name: fd.get('fullName') || '',
        email: normalizeEmail(email),
        mobile,
        mobileCountryCode: mobileDial,
        primarySource,
        secondarySource: fd.get('secondarySource') || '',
        tertiarySource: fd.get('tertiarySource') || '',
        channelPartnerName: primarySource.toLowerCase() === 'channel partner'
          ? (fd.get('channelPartnerName') || '') : '',
        project: fd.get('project') || '',
        status: 'New Lead',
        owner: loggedInUser,
      };
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json();
        // Show it straight away, then reconcile with the server so
        // server-computed fields (id, stage, logs, resolved names) are correct.
        setLeadsData(prev => [created, ...prev]);
        setIsModalOpen(false);

        /* Show the tab the lead is on. Creating one while "Rejected Leads" or
           "Site Visit" is selected would otherwise leave the list unchanged,
           as though nothing had been saved. */
        handleTabChange(tabForNewLead(created));
        setMobile('');
        setMobileDial(DEFAULT_DIAL);
        setEmail('');
        const assignedTo = created.ownerName || created.owner;

        /* A repeat needs explaining, not a one-line toast. The lead saves,
           changes status, and leaves this person's list — so they are told
           what matched, which earlier enquiry it matched, and where it went. */
        if (created.duplicate) {
          toast.info(`Lead ${created.id} saved as "${created.duplicate.kind}".`);
          await window.appAlert(
            duplicateMessage(created.duplicate, created),
            duplicateTitle(created.duplicate),
          );
        } else {
          // Name the owner: the round-robin queue picks it, not the person
          // filling the form, so who it landed on is the one thing they cannot
          // tell from what they typed.
          toast.success(
            assignedTo && assignedTo !== loggedInUser
              ? `Lead ${created.id} created and assigned to ${assignedTo}.`
              : `Lead ${created.id} created successfully.`,
          );

          // Say so when that colleague cannot actually be reached, rather than
          // leaving it to be discovered by nobody following the lead up.
          const notify = created.notify;
          if (notify && assignedTo !== loggedInUser) {
            const gaps = [];
            if (!notify.push) gaps.push('has not turned on notifications');
            if (!notify.email) gaps.push('has no email address');
            if (gaps.length) {
              toast.info(`${notify.owner} ${gaps.join(' and ')}, so may not see this lead.`);
            }
          }
        }

        fetchLeads();
        invalidateLeadCache();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error('Failed to create lead: ' + (errData.message || res.status));
      }
    } catch {
      toast.error('Failed to create lead.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Page
      title="Enquiry Lists"
      subtitle="View and manage all customer enquiries and their current status."
      actions={
        <>
          {/* Creating a lead is a create, and importing a file is creating
             many at once — both follow the same permission. */}
          {canCreate && <Button icon={Upload} onClick={() => navigate("/import-leads")}>Import</Button>}
          {(
            <Button variant="primary" icon={Plus} onClick={() => setIsModalOpen(true)}>
              Create Lead
            </Button>
          )}
        </>
      }
    >
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        selectable
        fullscreenable
        persistKey="leads"
        exportName={canExport ? 'leads' : undefined}
        searchPlaceholder="Search company, contact, project or owner..."
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        filters={filterFields}
      onFiltersChange={handleFiltersChange}
      emptyMessage="No enquiries found"
      emptyHint="Create a lead or import a list to get started."
      onDeleteSelected={canDelete ? handleDeleteSelected : undefined}
      actions={lead => (
        <RowActions
          label={lead.name || 'lead'}
          // View shows the full Leads as a document; downloading is a
          // button inside the preview. The row still opens the profile.
          onView={() => setPreviewLead(lead)}
          onEdit={canEdit ? () => navigate(`/leads/${lead.id}?edit=1`) : undefined}
          onLog={() => navigate(`/leads/${lead.id}?addLog=1`)}
        />
      )}
      />

      {/* The enquiry document, shown rather than saved. */}
      <DocumentPreview lead={previewLead} onClose={() => setPreviewLead(null)} />

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        size="lg"
        title="Create New Lead"
        description="Capture a new enquiry and assign it to yourself."
        footer={
          <>
            <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="nx-lead-form" loading={isSubmitting}>
              Create Lead
            </Button>
          </>
        }
      >
        <form id="nx-lead-form" onSubmit={handleCreate}>
          <FormGrid columns={2}>
            <Field label="Project Interested" required className="nx-field--full">
              <DynamicDropdown
                name="project"
                placeholder="Select Project"
                apiUrl="/api/projects"
                displayKey="projectName"
                valueKey="projectName"
                postPayloadKey="projectName"
                required
              />
            </Field>

            <Field label="Full Name" required>
              <Input name="fullName" placeholder="Full Name" required data-autofocus />
            </Field>
            <Field
              label="Email Address"
              required
              error={email ? emailError(email, { label: 'Email address' }) : ''}
            >
              <Input
                type="email"
                name="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={(e) => setEmail(normalizeEmail(e.target.value))}
                autoComplete="off"
                spellCheck="false"
                autoCapitalize="none"
                required
              />
            </Field>

            <Field
              label="Mobile Number"
              required
              hint={`${countryFor(mobileDial).name} format`}
              error={mobile ? validateNumber(mobile, mobileDial) : ''}
            >
              <PhoneInput
                name="mobile"
                countryName="mobileCountryCode"
                value={mobile}
                dial={mobileDial}
                onChange={setMobile}
                onDialChange={setMobileDial}
                required
              />
            </Field>
            <Field label="Primary Source" required>
              <DynamicDropdown
                name="primarySource"
                placeholder="Select Primary Source"
                apiUrl="/api/primary-sources"
                displayKey="sourceName"
                valueKey="sourceName"
                postPayloadKey="sourceName"
                required
              />
            </Field>

            <Field label="Secondary Source" required>
              <DynamicDropdown
                name="secondarySource"
                placeholder="Select Secondary Source"
                apiUrl="/api/secondary-sources"
                displayKey="sourceName"
                valueKey="sourceName"
                postPayloadKey="sourceName"
                required
              />
            </Field>
            <Field label="Tertiary Source" required>
              <DynamicDropdown
                name="tertiarySource"
                placeholder="Select Tertiary Source"
                apiUrl="/api/tertiary-sources"
                displayKey="sourceName"
                valueKey="sourceName"
                postPayloadKey="sourceName"
                required
              />
            </Field>
          </FormGrid>
        </form>
      </Modal>
    </Page>
  );
}
