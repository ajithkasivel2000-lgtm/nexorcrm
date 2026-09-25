/**
 * The sub-records shared by leads and opportunities.
 *
 * One place naming what exists, which parent each can hang off, and which
 * columns a client may write. Everything else — the controller, the routes —
 * reads from here, so adding a domain is one entry rather than a new file.
 *
 * A write list matters more than it looks: without it a client could set
 * `createdBy` to somebody else, or overwrite `entityId` and move a row onto a
 * record it was never part of.
 */
const prisma = require('../prismaClient');

/** The parents a sub-record may belong to, and the Prisma model for each. */
const ENTITY_MODELS = {
  lead: 'lead',
  opportunity: 'opportunity',
  customer: 'customer',
  // Activities, tasks, notes, contacts and documents on a project are the same
  // records as on a lead, so they use the same tables and the same endpoints.
  project: 'project',
  // Documents on a booking (agreement, allotment letter) are also what the
  // buyer sees in their portal.
  booking: 'booking',
};

/**
 * Every shared sub-record.
 *
 * `model`   the Prisma delegate
 * `fields`  what a client may set. Anything else in the body is ignored.
 * `dates`   columns needing string-to-Date coercion
 * `numbers` columns stored as Decimal
 * `order`   default sort
 */
const RECORD_TYPES = {
  activities: {
    model: 'activity',
    fields: ['type', 'subject', 'description', 'occurredAt', 'assignedTo', 'status', 'outcome', 'nextAction', 'nextActionDate'],
    dates: ['occurredAt', 'nextActionDate'],
    numbers: [],
    order: { occurredAt: 'desc' },
    required: ['type'],
  },
  tasks: {
    model: 'task',
    fields: ['title', 'description', 'dueDate', 'priority', 'status', 'assignedTo', 'completedAt', 'completedBy'],
    dates: ['dueDate', 'completedAt'],
    numbers: [],
    order: { dueDate: 'asc' },
    required: ['title'],
  },
  notes: {
    model: 'note',
    fields: ['body'],
    dates: [],
    numbers: [],
    order: { createdAt: 'desc' },
    required: ['body'],
  },
  contacts: {
    model: 'contact',
    fields: ['name', 'designation', 'department', 'phone', 'countryCode', 'email', 'isPrimary', 'isDecisionMaker', 'isInfluencer', 'isTechnical', 'isFinance', 'notes'],
    dates: [],
    numbers: [],
    order: { createdAt: 'asc' },
    required: ['name'],
  },
  products: {
    model: 'lineItem',
    fields: ['productName', 'category', 'description', 'quantity', 'unitPrice', 'discount', 'tax', 'interestLevel', 'notes'],
    dates: [],
    numbers: ['quantity', 'unitPrice', 'discount', 'tax'],
    order: { createdAt: 'asc' },
    required: ['productName'],
  },
  competitors: {
    model: 'competitor',
    fields: ['name', 'product', 'price', 'strength', 'weakness', 'ourAdvantage', 'customerPreference', 'status', 'notes'],
    dates: [],
    numbers: ['price'],
    order: { createdAt: 'asc' },
    required: ['name'],
  },
  risks: {
    model: 'risk',
    fields: ['title', 'category', 'severity', 'probability', 'impact', 'mitigation', 'owner', 'status', 'resolution'],
    dates: [],
    numbers: [],
    order: { createdAt: 'desc' },
    required: ['title'],
  },
  documents: {
    model: 'document',
    // Uploads are handled by their own route; this list is for editing what a
    // stored file is called or filed under, never where its bytes are.
    fields: ['fileName', 'category'],
    dates: [],
    numbers: [],
    order: { createdAt: 'desc' },
    required: ['fileName'],
  },
  'stage-history': {
    model: 'stageHistory',
    fields: [],           // written by the stage-change path, never by a client
    dates: [],
    numbers: [],
    order: { enteredAt: 'asc' },
    readOnly: true,
  },
};

/** Whether this parent kind is one we keep sub-records for. */
const isEntityType = (type) => Object.prototype.hasOwnProperty.call(ENTITY_MODELS, type);

/** Whether this sub-record kind exists. */
const isRecordType = (type) => Object.prototype.hasOwnProperty.call(RECORD_TYPES, type);

/**
 * Confirms the parent exists before anything is hung off it.
 *
 * Without this a typo in the id would create rows pointing at nothing — they
 * would be written happily and never be readable, because no page would ever
 * ask for that id.
 */
async function parentExists(entityType, entityId) {
  if (!isEntityType(entityType) || !entityId) return false;
  const found = await prisma[ENTITY_MODELS[entityType]].findUnique({ where: { id: entityId } });
  return Boolean(found);
}

/**
 * Keeps only the columns a client may write, coercing as it goes.
 *
 * Returns { data, error }. An unparseable date or number is an error rather
 * than a silent null: a due date that quietly vanished is worse than a refused
 * save.
 */
function cleanPayload(recordType, body = {}) {
  const spec = RECORD_TYPES[recordType];
  const data = {};

  for (const key of spec.fields) {
    if (!(key in body)) continue;
    let value = body[key];

    if (spec.dates.includes(key)) {
      if (value === '' || value === null) { data[key] = null; continue; }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return { error: `${key} is not a valid date` };
      data[key] = parsed;
      continue;
    }

    if (spec.numbers.includes(key)) {
      if (value === '' || value === null) { data[key] = null; continue; }
      const n = Number(value);
      if (!Number.isFinite(n)) return { error: `${key} must be a number` };
      data[key] = n;
      continue;
    }

    if (typeof value === 'string') value = value.trim();
    data[key] = value;
  }

  return { data };
}

/** Whatever the required fields are, present and not blank. */
function missingRequired(recordType, data) {
  const spec = RECORD_TYPES[recordType];
  return (spec.required || []).filter((key) => {
    const v = data[key];
    return v === undefined || v === null || String(v).trim() === '';
  });
}

/**
 * Removes every sub-record belonging to a parent, then the caller removes the
 * parent itself — pass a `prisma` client (an interactive-transaction handle,
 * typically) so both halves land or neither does.
 *
 * The price of one shared table per domain is that the database cannot cascade
 * — a column cannot point at three tables — so deleting a lead has to say so
 * here. Without the transaction, a failure after the deleteMany had emptied
 * the sub-records left a half-applied delete behind: parent gone, history not.
 */
async function deleteEntityRecords(entityType, entityId, client = prisma) {
  const where = { entityType, entityId };
  const models = [...new Set(Object.values(RECORD_TYPES).map((r) => r.model))];
  const removed = {};
  for (const model of models) {
    const { count } = await client[model].deleteMany({ where });
    if (count > 0) removed[model] = count;
  }
  return removed;
}

module.exports = {
  ENTITY_MODELS,
  RECORD_TYPES,
  isEntityType,
  isRecordType,
  parentExists,
  cleanPayload,
  missingRequired,
  deleteEntityRecords,
};
