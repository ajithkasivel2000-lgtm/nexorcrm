/**
 * What the in-app assistant knows about NexorCRM.
 *
 * Every answer here is written against how this build actually behaves — the
 * duplicate rule, the RRQ rota, what a status change notifies — so the
 * assistant explains this CRM rather than CRMs in general.
 *
 * Each topic carries:
 *   id       stable key, recorded on the message that used it so a wrong
 *            answer can be traced back to the article that produced it
 *   title    the heading shown above the answer
 *   keywords words that should pull this topic up. Weighted: a phrase match
 *            counts for more than a single word
 *   answer   the reply, in plain words
 *   steps    optional numbered steps
 *   screen   where in the CRM to go, shown as a link
 *
 * Adding a topic is the whole job of teaching it something new — no model, no
 * retraining, no key required.
 */

const TOPICS = [
  {
    id: 'create-lead',
    title: 'Creating a lead',
    keywords: ['create lead', 'add lead', 'new lead', 'new enquiry', 'create enquiry', 'add enquiry', 'how to create leads', 'make a lead'],
    screen: { label: 'Leads', path: '/leads' },
    answer:
      'Leads are created from the Leads screen, titled Enquiry Lists. The project, name, mobile, email and all three '
      + 'sources are required, and the mobile is checked as a real Indian number before it saves.',
    steps: [
      'Open Leads from the sidebar.',
      'Click Create Lead, top right.',
      'Pick the Project Interested — the duplicate check and the round-robin queue both work per project, so this comes first.',
      'Fill in the full name, mobile, email and the primary, secondary and tertiary sources.',
      'Click Create Lead. The list jumps to the tab the new lead landed on.',
    ],
    related: ['duplicate-check', 'lead-owner', 'import-leads'],
  },
  {
    id: 'duplicate-check',
    title: 'How duplicates are detected',
    keywords: ['duplicate', 'duplicate lead', 'possible duplicate', 'same number', 'same mobile', 'same email', 'repeat lead', 'already exists'],
    screen: { label: 'Duplicate Leads', path: '/leads?tab=duplicate' },
    answer:
      'Duplicates are judged per project, not across the whole database — the same person enquiring about two '
      + 'different projects is two real leads. Within one project: the same mobile number makes it a Duplicate; '
      + 'the same email address only makes it a Possible Duplicate. Either way the lead is still saved, its status '
      + 'is set accordingly, and it is assigned to the super admin rather than to a salesperson, so the same '
      + 'customer does not end up in two people\'s lists. You are shown what matched and which earlier enquiry it '
      + 'matched.',
    related: ['create-lead', 'lead-owner'],
  },
  {
    id: 'lead-owner',
    title: 'Who a lead is assigned to',
    keywords: [
      'owner', 'lead owner', 'assign', 'assigned to', 'reassign', 'change owner',
      'allocate', 'allocation', 'rrq', 'round robin', 'queue',
      /* "who gets a new lead" is about assignment, but "new lead" is one of
         Creating a lead's phrases and would otherwise win it. */
      'who gets', 'who gets the lead', 'who gets a new lead', 'who is assigned',
      'goes to who', 'lands with',
    ],
    screen: { label: 'RRQ', path: '/rrq' },
    answer:
      'A new lead is handed out by the round-robin queue (RRQ) set up for its project, so work is shared evenly '
      + 'rather than going to whoever typed it in. Duplicates skip the queue and go to the super admin. You can '
      + 'change the owner later from the lead profile — Lead Information tab, Lead Owner — or by setting the status '
      + 'to Allocate. Both ask you to confirm first, because the lead leaves one person\'s list and appears in '
      + 'another\'s.',
    steps: [
      'Open the lead.',
      'Go to the Lead Information tab.',
      'Click Lead Owner and pick the new owner.',
      'Confirm the handover when asked.',
    ],
    related: ['notifications', 'duplicate-check'],
  },
  {
    id: 'change-status',
    title: 'Changing a lead status',
    keywords: ['status', 'change status', 'update status', 'lead status', 'move status', 'set status', 'attempted', 'interested', 'stage'],
    answer:
      'The status pill is the control — click it wherever you see it, in a list or on the lead itself. Some '
      + 'statuses need details before they can be set: Attempted asks how the call went and when to try again, '
      + 'Interested asks for a follow-up date, Rejected asks why, Allocate asks who to hand it to. Fill the short '
      + 'form and save. Every change is written to the Lead Log with your name and the time.',
    steps: [
      'Click the status pill.',
      'Pick the new status from the list.',
      'Fill in the details it asks for, if any.',
      'Save.',
    ],
    related: ['lead-tabs', 'site-visit', 'notifications'],
  },
  {
    id: 'site-visit',
    title: 'Site visits',
    keywords: ['site visit', 'visit', 'schedule visit', 'reschedule', 'site visit done', 'confirmed', 'visit stages'],
    answer:
      'Once a lead reaches Site Visit it moves through its own stages rather than the ordinary status list: '
      + 'Site Visit Scheduled, Re Scheduled Visit, Site Visit Confirmed, Site Visit Done, then either Opportunity '
      + 'or Rejected. Each stage records its own date and note. The lead profile grows a Site Visit Details tab '
      + 'showing all of them, and that tab stays available afterwards so the history is still readable once the '
      + 'lead has moved on.',
    related: ['change-status', 'opportunity'],
  },
  {
    id: 'opportunity',
    title: 'Converting to an opportunity',
    keywords: ['opportunity', 'convert', 'conversion', 'booking', 'won', 'convert lead'],
    screen: { label: 'Opportunity', path: '/opportunities' },
    answer:
      'A lead becomes an opportunity from the Site Visit Done stage — set the site visit status to Opportunity and '
      + 'fill in the booking details. The opportunity gets its own record with its own id (OPP-…), and from then on '
      + 'the work happens there. The lead itself becomes read-only: it was what the opportunity was created from, so '
      + 'editing it afterwards would leave the two telling different stories about the same customer.',
    related: ['site-visit'],
  },
  {
    id: 'lead-tabs',
    title: 'Finding things on a lead',
    keywords: ['tabs', 'lead profile', 'where is', 'lead page', 'open lead', 'lead details', 'attempted tab', 'sections'],
    answer:
      'A lead opens on the tab its status is about — an Attempted lead opens on Attempt Details, one at Site Visit '
      + 'on Site Visit Details — so the thing you came to read is already on screen. Contact Details holds the name, '
      + 'number, email and project. Lead Information holds the owner, rating, allocator and dates, with Source '
      + 'Information beside it. Attempt Details and Site Visit Details appear only once there is something in them. '
      + 'The Lead Progress rail and the Lead Log stay on screen whichever tab you are on.',
    related: ['change-status', 'lead-log'],
  },
  {
    id: 'lead-log',
    title: 'The Lead Log',
    keywords: ['log', 'lead log', 'history', 'activity', 'audit', 'who changed', 'timeline'],
    answer:
      'Every change to a lead is recorded in the Lead Log on the right of the lead profile: what changed, from what '
      + 'to what, who did it and when. Status changes, owner changes, edited fields and the result of every '
      + 'notification are all there. Use the dropdown above it to filter to one kind of entry.',
    related: ['change-status', 'notifications'],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    keywords: [
      'notification', 'notify', 'push', 'bell', 'alert', 'told', 'reminder',
      // What the CRM sends, as opposed to how the wording is edited.
      'email', 'emails sent', 'what emails', 'which emails', 'does it send', 'sends',
    ],
    screen: { label: 'Mail Settings', path: '/settings/mail' },
    answer:
      'When a lead is assigned to someone they are told three ways: the bell inside the CRM, a push notification '
      + 'that reaches a closed browser, and an email built from an editable template. The same three fire when a '
      + 'lead is handed to a new owner. Nobody is notified about their own action — if you create a lead that lands '
      + 'with you, or assign one to yourself, nothing is sent. What each channel did is written to the Lead Log, so '
      + 'a failed email says so rather than disappearing.',
    related: ['email-templates', 'lead-owner'],
  },
  {
    id: 'email-templates',
    title: 'Email templates',
    keywords: ['template', 'email template', 'mail template', 'edit email', 'placeholder'],
    screen: { label: 'Email Templates', path: '/settings/email-templates' },
    answer:
      'The emails the CRM sends are templates you can edit — wording, subject, everything — using placeholders like '
      + '{OWNER_NAME}, {ENQUIRY_ID}, {CUSTOMER_NAME}, {PROJECT_NAME} and {LEAD_OWNER} that are filled in when the '
      + 'mail is sent. The ones the system sends itself cannot be deleted, but can be switched off. Switching one '
      + 'off stops that email entirely.',
    related: ['notifications'],
  },
  {
    id: 'import-leads',
    title: 'Importing leads',
    keywords: ['import', 'bulk', 'csv', 'excel', 'upload leads', 'many leads'],
    screen: { label: 'Import Leads', path: '/import-leads' },
    answer:
      'Import Leads takes a CSV. Columns it understands include enquiry name, phone number, email id, primary '
      + 'source, secondary source, tertiary source and project id. Imported leads go through the same round-robin '
      + 'assignment as typed ones. If one person receives more than a handful in a single import they get one '
      + 'summary message instead of an email per lead.',
    related: ['create-lead', 'notifications'],
  },
  {
    id: 'masters',
    title: 'Dropdown lists (masters)',
    keywords: ['master', 'dropdown', 'options', 'add option', 'source list', 'project type', 'project status', 'call status', 'open reason', 'lead type'],
    answer:
      'The dropdowns are master lists you control rather than fixed code — primary, secondary and tertiary sources, '
      + 'project types and statuses, lead types and statuses, call statuses and open reasons. Most can be added to '
      + 'straight from the dropdown: open it and choose Add new. Only the super admin can delete an entry, and a '
      + 'duplicate name is refused whatever its capitalisation.',
    related: ['change-status'],
  },
  {
    id: 'users',
    title: 'Users and roles',
    keywords: ['user', 'users', 'role', 'permission', 'admin', 'manager', 'employee', 'add user', 'ban', 'access'],
    screen: { label: 'User Admin', path: '/settings/user-admin' },
    answer:
      'Users have a role — Admin, Manager or Employee — and what they see follows from it. An Employee sees only '
      + 'their own leads; a Manager sees their team; the super admin sees everything and is the only one who can '
      + 'delete records. The reserved admin account is hidden from the lists and cannot be picked as a lead owner, '
      + 'because duplicates are assigned to it by design.',
    related: ['lead-owner'],
  },
  {
    id: 'dashboard',
    title: 'The dashboard',
    keywords: ['dashboard', 'report', 'stats', 'chart', 'overview', 'numbers', 'kpi', 'insight'],
    screen: { label: 'Dashboard', path: '/' },
    answer:
      'The dashboard opens on a whole-CRM picture — totals, trends, leads by status, source, owner and rating, and '
      + 'recent activity — with the Project Status tiles underneath. Each tile links through to the matching list. '
      + 'Use the project dropdown to narrow everything to one project.',
    related: ['lead-tabs'],
  },
  {
    id: 'search-leads',
    title: 'Finding a lead',
    keywords: ['search', 'find lead', 'filter', 'look up', 'where is lead', 'tabs list'],
    screen: { label: 'Enquiry Lists', path: '/leads' },
    answer:
      'The Leads screen has a search box that matches name, company, project and owner, and filters for project, '
      + 'source, status and owner. The tabs across the top split the same list: All Leads, Our Leads, Duplicate '
      + 'Leads (super admin only), Rejected Leads, Site Visit and Follow Up. A lead with a dedicated status appears '
      + 'in its own tab rather than twice.',
    related: ['create-lead', 'lead-tabs'],
  },
  {
    id: 'follow-up',
    title: 'Follow-ups',
    keywords: ['follow up', 'followup', 'next follow up', 'due', 'call back', 'reminder date'],
    answer:
      'A follow-up date can be set on the lead itself, or captured when you set a status that asks for one — '
      + 'Attempted and Interested both do. The Follow Up tab on the Leads screen shows every lead that has one, and '
      + 'Missed Follow Up on the dashboard shows the ones that have gone past.',
    related: ['change-status', 'dashboard'],
  },
];

/** Everything the assistant can talk about, for the opening suggestions. */
const SUGGESTIONS = [
  'How do I create a lead?',
  'How are duplicate leads handled?',
  'Who does a new lead get assigned to?',
  'How do I change a lead status?',
  'How do I import leads from a spreadsheet?',
  'What notifications does the CRM send?',
];

module.exports = { TOPICS, SUGGESTIONS };
