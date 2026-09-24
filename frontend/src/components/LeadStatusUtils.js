export const FORMS = {
  Attempted: {
    title: 'Mark as Attempted',
    description: 'Record how the call went, and when to try again.',
    fields: [
      /* Both read their master list rather than a list written here, so the
         options can be changed without a release — and a reason typed once is
         on the list for everybody next time. */
      {
        name: 'openReason',
        label: 'Open Reason',
        type: 'master',
        api: '/api/open-reasons',
        field: 'reasonName',
        placeholder: 'Select Open Reason',
      },
      {
        name: 'callStatus',
        label: 'Call Status',
        type: 'master',
        api: '/api/call-statuses',
        field: 'statusName',
        placeholder: 'Select Call Status',
      },
      { name: 'followUpDate', label: 'Follow Up Date', type: 'datetime-local', when: 'future' },
      { name: 'callRemarks', label: 'Remarks', type: 'textarea', full: true },
    ],
    toPayload: (v) => ({
      openReason: v.openReason || undefined,
      callStatus: v.callStatus || undefined,
      followUpDate: v.followUpDate || undefined,
      callRemarks: v.callRemarks || undefined,
    }),
  },

  Rejected: {
    title: 'Mark as Rejected',
    description: 'A rejected lead is kept, so the reason is worth recording.',
    fields: [
      {
        name: 'reasonDetails',
        label: 'Rejected Reason',
        type: 'textarea',
        required: true,
        full: true,
        placeholder: 'Why was this lead rejected?',
      },
    ],
    toPayload: (v) => ({ reasonDetails: v.reasonDetails }),
    summary: (v) => `Rejected - ${v.reasonDetails}`,
  },

  'Site Visit': {
    title: 'Schedule a Site Visit',
    description: 'The date is what the reminder and the follow-up list work from.',
    fields: [
      { name: 'siteVisitDate', label: 'Site Visit Date', type: 'datetime-local', required: true, when: 'future' },
      { name: 'siteVisitNote', label: 'Note', type: 'textarea', full: true },
    ],
    toPayload: (v) => ({
      siteVisitDate: v.siteVisitDate,
      siteVisitNote: v.siteVisitNote || undefined,
      siteVisitStatus: 'Scheduled',
    }),
  },

  Interested: {
    title: 'Mark as Interested',
    description: 'Set when to follow up so this does not go quiet.',
    fields: [
      { name: 'followUpDate', label: 'Follow Up Date', type: 'datetime-local', required: true, when: 'future' },
      { name: 'callRemarks', label: 'Remarks', type: 'textarea', full: true },
    ],
    toPayload: (v) => ({
      followUpDate: v.followUpDate,
      callRemarks: v.callRemarks || undefined,
    }),
  },

  Allocate: {
    title: 'Allocate this Lead',
    description: 'Hand the lead to a colleague. They are told it is theirs.',
    fields: [
      { name: 'owner', label: 'Allocate To', type: 'user', required: true },
      { name: 'followUpDate', label: 'Target Date', type: 'datetime-local', when: 'future' },
      { name: 'additionalRemarks', label: 'Notes', type: 'textarea', full: true },
    ],
    toPayload: (v) => ({
      owner: v.owner,
      followUpDate: v.followUpDate || undefined,
      additionalRemarks: v.additionalRemarks || undefined,
    }),
    summary: (v) => `allocated to ${v.owner}`,
  },
};

/**
 * Entries in the status list that are an ACTION, not a stage.
 *
 * Allocating hands the lead to a colleague. Where it sits in the pipeline is
 * unchanged by that — a lead at Site Visit that is passed to someone else is
 * still at Site Visit. But "Allocate" shares the one status column with the
 * real stages, so choosing it overwrote the stage and the lead fell back to
 * reading as an early one: the progress bar dropped to Contacted while the
 * site-visit details it had collected were still sitting on the record.
 *
 * Listed here so the dialog knows to send the action's own fields (the new
 * owner) and leave `status` alone, the same way an `sv:` stage writes only
 * siteVisitStatus.
 */
export const ACTION_ONLY_STATUSES = new Set(['Allocate']);

/**
 * Once a lead is at Site Visit it moves through its own stages, and each one
 * records a different date. They are keyed under `sv:` so "Rejected" as a site
 * visit outcome stays distinct from "Rejected" as a lead status — the two
 * write different columns.
 */
export const SITE_VISIT_STAGES = [
  'Site Visit Scheduled',
  'Re Scheduled Visit',
  'Site Visit Confirmed',
  'Site Visit Done',
  'Opportunity',
  'Rejected',
];

/**
 * Converting creates an Opportunity record as well as moving the lead, so it
 * does not go through the status endpoint like the other stages.
 */
export const SV_CONVERTS = 'Opportunity';

Object.assign(FORMS, {
  'sv:Site Visit Scheduled': {
    title: 'Site Visit Scheduled',
    description: 'The date the visit is booked for.',
    fields: [
      { name: 'siteVisitDate', label: 'Site Visit Date', type: 'datetime-local', required: true, when: 'future' },
      { name: 'siteVisitNote', label: 'Note', type: 'textarea', full: true },
    ],
    toPayload: (v) => ({
      siteVisitStatus: 'Site Visit Scheduled',
      siteVisitDate: v.siteVisitDate,
      siteVisitNote: v.siteVisitNote || undefined,
    }),
  },

  'sv:Re Scheduled Visit': {
    title: 'Re-schedule the Visit',
    description: 'The new date replaces the one already booked.',
    fields: [
      { name: 'siteVisitDate', label: 'New Date', type: 'datetime-local', required: true, when: 'future' },
      { name: 'siteVisitNote', label: 'Reason / Note', type: 'textarea', full: true },
    ],
    toPayload: (v) => ({
      siteVisitStatus: 'Re Scheduled Visit',
      siteVisitDate: v.siteVisitDate,
      siteVisitNote: v.siteVisitNote || undefined,
    }),
  },

  'sv:Site Visit Confirmed': {
    title: 'Confirm the Site Visit',
    description: 'Confirmed with the customer, and who is taking them.',
    fields: [
      { name: 'siteVisitConfirmedDate', label: 'Confirmed Date', type: 'datetime-local', required: true, when: 'future' },
      { name: 'owner', label: 'Lead Owner', type: 'user' },
      { name: 'siteVisitConfirmedNote', label: 'Note', type: 'textarea', full: true },
    ],
    toPayload: (v) => ({
      siteVisitStatus: 'Site Visit Confirmed',
      siteVisitConfirmedDate: v.siteVisitConfirmedDate,
      siteVisitConfirmedNote: v.siteVisitConfirmedNote || undefined,
      // Left out when unchanged, so confirming a visit does not quietly
      // reassign the lead.
      owner: v.owner || undefined,
    }),
  },

  'sv:Site Visit Done': {
    title: 'Site Visit Done',
    description: 'What happened on the visit.',
    fields: [
      { name: 'siteVisitDoneDate', label: 'Done Date', type: 'datetime-local', required: true, when: 'past' },
      { name: 'siteVisitDoneNote', label: 'Note', type: 'textarea', full: true },
    ],
    toPayload: (v) => ({
      siteVisitStatus: 'Site Visit Done',
      siteVisitDoneDate: v.siteVisitDoneDate,
      siteVisitDoneNote: v.siteVisitDoneNote || undefined,
    }),
  },

  'sv:Opportunity': {
    title: 'Convert to Opportunity',
    description: 'An opportunity record is created and the lead moves on to it.',
    fields: [
      {
        name: 'bookingStatus',
        label: 'Booking Status',
        type: 'select',
        options: ['Initiate', 'Booking Done'],
        required: true,
        full: true,
      },
    ],
    // Flagged rather than sent: the caller runs the two-step conversion, since
    // a record has to exist before the lead can be said to have become one.
    toPayload: (v) => ({ convert: true, bookingStatus: v.bookingStatus }),
    summary: (v) => `Opportunity (${v.bookingStatus})`,
  },

  'sv:Rejected': {
    title: 'Site Visit Rejected',
    description: 'The visit did not go ahead. The lead itself is not rejected.',
    fields: [
      {
        name: 'reasonDetails',
        label: 'Reason',
        type: 'textarea',
        required: true,
        full: true,
        placeholder: 'Why was the visit rejected?',
      },
    ],
    toPayload: (v) => ({
      siteVisitStatus: 'Rejected',
      reasonDetails: v.reasonDetails,
    }),
    summary: (v) => `Site Visit Rejected - ${v.reasonDetails}`,
  },
});

/** Whether picking this status should ask for anything first. */
export function statusNeedsDetails(status) {
  return Object.prototype.hasOwnProperty.call(FORMS, status);
}
