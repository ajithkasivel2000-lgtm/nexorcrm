/* Shared by the lead controllers: date coercion, field labels for the change
   log, user and project lookups. Moved out of leadController.js unchanged. */
const prisma = require('../../prismaClient');

// ─── Indian mobile validation helper ──────────────────────────────────────────
// Validates and normalizes Indian mobile numbers.
// Accepts: 10-digit string starting with 6/7/8/9, optionally prefixed with +91 or 91.
// Returns the cleaned 10-digit number, or throws on invalid input.
// For optional fields, pass allowEmpty=true to skip validation when value is empty.

// Format a 10-digit mobile number for display as +91 XXXXX XXXXX
/** Every DateTime column on the Lead model. */
const LEAD_DATE_FIELDS = [
  'followUpDate',
  'siteVisitDate',
  'siteVisitConfirmedDate',
  'siteVisitDoneDate',
  'virtualVisitDate',
  'allocatedDate',
];

/**
 * What a request body may write onto a Lead row.
 *
 * The lead write endpoints used to spread the whole request body into the
 * Prisma data, so a crafted payload could set any column: `id` (moving the
 * primary key and breaking its log/history relations), `createdAt`, the
 * reassignment bookkeeping (`allocator`, `assignedAt`, `lastActivityAt`) that
 * the follow-up clock depends on, or `ownerId` directly — skipping the
 * allocator stamp and log a real handover goes through (syncOwnerId derives
 * ownerId from `owner`; no client needs to send it).
 *
 * Everything on this list is a column the screens genuinely edit. Anything
 * not on it is dropped before the query is built.
 */
const LEAD_WRITABLE_FIELDS = new Set([
  // Identity and contact.
  'name', 'email', 'alternateEmail',
  'mobile', 'mobileCountryCode', 'alternateNo', 'alternateNoCountryCode',
  'occupation', 'companyName', 'euid',
  // Pipeline and ownership. `owner` only — see syncOwnerId for ownerId.
  'status', 'project', 'owner', 'allocatedDate',
  'rating', 'budgetLimit',
  // Where the lead came from.
  'primarySource', 'secondarySource', 'tertiarySource',
  'channelPartnerName', 'channelPartnerId', 'referrerDetails', 'sourceUrl',
  // Call and follow-up.
  'openReason', 'callStatus', 'callRemarks', 'followUpDate',
  'rejectionType', 'reasonDetails', 'invalidReason',
  'competitorName', 'competitorOffer',
  // Site visit, conversion and notes.
  'siteVisitStatus', 'siteVisitDate', 'siteVisitNote',
  'siteVisitConfirmedDate', 'siteVisitConfirmedNote',
  'siteVisitDoneDate', 'siteVisitDoneNote',
  'bookingStatus', 'virtualVisit', 'virtualVisitDate',
  'otherNotes', 'additionalRemarks',
]);

/**
 * Copy of `body` holding only the fields a client may write on a lead.
 *
 * Applied at the top of every lead write handler (create, update, status,
 * fields), so no path can forget it. Server-set values — the log entries,
 * the resolved ownerId, allocator and duplicate status — are attached after
 * this, by the handlers themselves.
 */
const pickLeadFields = (body) => {
  const out = {};
  for (const key of Object.keys(body || {})) {
    if (LEAD_WRITABLE_FIELDS.has(key)) out[key] = body[key];
  }
  return out;
};

/**
 * Prisma rejects a string for a DateTime column, so every date on an incoming
 * update has to be coerced before it reaches the query. An empty string — what
 * a cleared date input sends — means "no date", which is null, not ''.
 *
 * Mutates `data` in place. Returns an error message for the caller to send as
 * a 400, or null when everything parsed.
 */
const coerceLeadDates = (data) => {
  for (const key of LEAD_DATE_FIELDS) {
    if (!(key in data)) continue;
    const value = data[key];
    if (value === '' || value === null || value === undefined) {
      data[key] = null;
      continue;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return `${key} is not a valid date`;
    data[key] = parsed;
  }
  return null;
};

/** Field names as a person would read them in the Lead Log. */
const LEAD_FIELD_LABELS = {
  name: 'Name',
  euid: 'EUID',
  mobile: 'Mobile Number',
  email: 'Email',
  alternateNo: 'Alternate Number',
  alternateEmail: 'Alternate Email',
  occupation: 'Occupation',
  companyName: 'Company Name',
  project: 'Project',
  rating: 'Rating',
  owner: 'Lead Owner',
  allocator: 'Allocator',
  allocatedDate: 'Allocated Date',
  followUpDate: 'Follow Up Date',
  virtualVisit: 'Virtual Visit',
  virtualVisitDate: 'Virtual Visit Date',
  primarySource: 'Primary Source',
  secondarySource: 'Secondary Source',
  tertiarySource: 'Tertiary Source',
  channelPartnerName: 'Channel Partner Name',
  channelPartnerId: 'Channel Partner ID',
  referrerDetails: 'Referrer Details',
  sourceUrl: 'Source URL',
  openReason: 'Open Reason',
  callStatus: 'Call Status',
  callRemarks: 'Call Remarks',
  reasonDetails: 'Rejected Reason',
  rejectionType: 'Rejected Reason Subtype',
  siteVisitStatus: 'Site Visit Status',
  siteVisitDate: 'Site Visit Scheduled Date',
  siteVisitNote: 'Site Visit Scheduled Note',
  siteVisitConfirmedDate: 'Site Visit Confirmed Date',
  siteVisitConfirmedNote: 'Site Visit Confirmed Note',
  siteVisitDoneDate: 'Site Visit Done Date',
  siteVisitDoneNote: 'Site Visit Done Note',
  otherNotes: 'Other Notes',
  additionalRemarks: 'Additional Remarks',
  budgetLimit: 'Budget Limit',
  status: 'Status',
};

/** How much of a long note to quote in a log subtitle. */
const LOG_VALUE_MAX = 60;

/** Renders a stored value the way the log should show it. */
const displayLeadValue = (key, value) => {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (LEAD_DATE_FIELDS.includes(key)) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).replace(',', '');
  }
  const text = String(value);
  return text.length > LOG_VALUE_MAX ? `${text.slice(0, LOG_VALUE_MAX)}…` : text;
};

/** Dates compare by instant; everything else by its string form. */
const sameLeadValue = (key, a, b) => {
  if (LEAD_DATE_FIELDS.includes(key)) {
    const ta = a === null || a === undefined || a === '' ? null : new Date(a).getTime();
    const tb = b === null || b === undefined || b === '' ? null : new Date(b).getTime();
    return ta === tb;
  }
  return String(a ?? '') === String(b ?? '');
};

/**
 * Describes what an update actually changed, as one LeadLog row per field.
 *
 * Only fields present in the request are considered, and only when the value
 * really moved — re-saving the same text should not fill the log with noise.
 * The number and its country code are written together, so they read as a
 * single "Mobile Number" change rather than two unrelated ones.
 *
 * `labels` lets the caller pass display names for values stored as IDs (the
 * lead owner, mainly), so the log shows a username instead of a UUID.
 */
const buildLeadChangeLogs = (before, updateData, actor, labels = {}) => {
  const who = actor ? `by ${actor}` : 'by an unknown user';
  const entries = [];
  const handled = new Set();

  const show = (key, value) => labels[`${key}:${value}`] || displayLeadValue(key, value);

  // Mobile number and dial code, as one entry.
  if ('mobile' in updateData || 'mobileCountryCode' in updateData) {
    handled.add('mobile');
    handled.add('mobileCountryCode');
    const numberMoved = 'mobile' in updateData && !sameLeadValue('mobile', before.mobile, updateData.mobile);
    const codeMoved = 'mobileCountryCode' in updateData
      && !sameLeadValue('mobileCountryCode', before.mobileCountryCode, updateData.mobileCountryCode);
    if (numberMoved || codeMoved) {
      const oldFull = `${before.mobileCountryCode || ''} ${before.mobile || ''}`.trim() || '(empty)';
      const nextCode = 'mobileCountryCode' in updateData ? updateData.mobileCountryCode : before.mobileCountryCode;
      const nextNum = 'mobile' in updateData ? updateData.mobile : before.mobile;
      const newFull = `${nextCode || ''} ${nextNum || ''}`.trim() || '(empty)';
      entries.push({
        title: 'Mobile Number Updated',
        subtitle: `${oldFull} → ${newFull} ${who}`,
      });
    }
  }

  for (const key of Object.keys(updateData)) {
    if (handled.has(key)) continue;
    if (!(key in before)) continue;          // not a column we track
    if (key === 'id' || key === 'createdAt' || key === 'updatedAt') continue;
    // A mirror of `owner`, kept in sync by syncOwnerId. "Lead Owner Updated"
    // already says what changed; a second entry for the id would just repeat it.
    if (key === 'ownerId') continue;
    if (sameLeadValue(key, before[key], updateData[key])) continue;

    const label = LEAD_FIELD_LABELS[key] || key;
    entries.push({
      title: `${label} Updated`,
      subtitle: `${show(key, before[key])} → ${show(key, updateData[key])} ${who}`,
    });
  }

  return entries;
};

// Shared helper: resolve any identifier (username or UUID) to a user record
const resolveUser = async (identifier) => {
  if (!identifier) return null;
  try {
    return await prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { id: identifier }] }
    });
  } catch {
    return null;
  }
};

/**
 * Keeps `ownerId` in step with `owner`.
 *
 * A lead carries the owner twice: `owner` — which every edit writes — and
 * `ownerId`, set only at creation. Nothing kept them together, so after a
 * reassignment the row said one thing and `ownerId` still named the previous
 * owner. That is not only a wrong name on the profile: list visibility and the
 * dashboard filter on `ownerId`, so the lead stayed in the old owner's list and
 * notifications went to them.
 *
 * Called before any update that may carry an owner; a no-op otherwise.
 */
const syncOwnerId = async (updateData, before = null, actor = null) => {
  if (!('owner' in updateData)) return null;
  const user = await resolveUser(updateData.owner);
  // Fall back to the raw value: an owner we cannot resolve is still the owner.
  updateData.ownerId = user ? user.id : (updateData.owner || null);

  // Only a real move counts — re-saving the same owner is not a handover.
  const moved = before && actor
    && String(before.owner ?? '') !== String(updateData.owner ?? '');
  if (!moved) return null;

  // Handing the lead to someone else is an allocation, so record who did it.
  updateData.allocator = actor;
  updateData.allocatedDate = new Date();

  const previous = await resolveUser(before.owner);
  return { from: previous ? previous.username : (before.owner || null), by: actor };
};

// Shared helper: resolve project name/ID to project ID
const resolveProjectId = async (projectNameOrId) => {
  if (!projectNameOrId) return null;
  try {
    const project = await prisma.project.findFirst({
      where: { OR: [{ id: projectNameOrId }, { projectName: projectNameOrId }] }
    });
    return project ? project.id : projectNameOrId;
  } catch {
    return projectNameOrId;
  }
};

module.exports = { LEAD_DATE_FIELDS, LEAD_WRITABLE_FIELDS, pickLeadFields, coerceLeadDates, LEAD_FIELD_LABELS, LOG_VALUE_MAX, displayLeadValue, sameLeadValue, buildLeadChangeLogs, resolveUser, syncOwnerId, resolveProjectId };
