/**
 * RRQ types the routing code depends on by name.
 *
 * Lead assignment looks a queue up by its type — `{ projectName, rrqType:
 * 'Presales' }` in the website and campaign handlers, and 'Sales' or
 * 'Presales' in the import handler. Those are string matches, not foreign
 * keys, so deleting the type deletes nothing and breaks nothing loudly: the
 * lookup simply stops finding a queue, and new leads arrive unassigned with no
 * error anywhere.
 *
 * Keep this in step with frontend/src/utils/rrqTypes.js.
 */
const RESERVED_RRQ_TYPES = ['Presales', 'Sales'];

/* The exact strings the routing code looks queues up by. Every lookup site
   imports these instead of writing its own literal, so renaming a type (or
   grepping for the wiring) has one place to land. A queue looked up by a
   string that no longer matches silently assigns nobody — these constants
   exist so the lookup and the CRUD guard can never drift apart. */
const PRESALES_RRQ_TYPE = RESERVED_RRQ_TYPES[0];
const SALES_RRQ_TYPE = RESERVED_RRQ_TYPES[1];

/** True when a type name is one the routing code relies on. Case-insensitive. */
function isReservedRrqType(name) {
  const value = String(name || '').trim().toLowerCase();
  return RESERVED_RRQ_TYPES.some((reserved) => reserved.toLowerCase() === value);
}

/**
 * What the import form sent, before the master table existed.
 *
 * The Queue Type dropdown used to be three hard-coded options with slugs of
 * their own, so those slugs are in circulation. They are translated rather
 * than dropped: an import posted by an older tab must not quietly land in the
 * wrong queue. 'channel-partner' had no queue behind it at all — it fell
 * through to Presales — so it keeps doing exactly that.
 */
const LEGACY_QUEUE_SLUGS = {
  'pre-sales': PRESALES_RRQ_TYPE,
  presales: PRESALES_RRQ_TYPE,
  sales: SALES_RRQ_TYPE,
  'channel-partner': PRESALES_RRQ_TYPE,
};

/**
 * The queue type to route by, given whatever the client sent.
 *
 * Resolution order: an exact (case-insensitive) name from the RRQ Type master
 * wins, then a legacy slug, then Presales — the same default the import has
 * always fallen back to, so a value nobody recognises assigns leads rather
 * than stranding them.
 *
 * @param {object} prisma
 * @param {string} value  whatever arrived as `queueType`
 * @returns {Promise<string>} a typeName suitable for an RRQ lookup
 */
async function resolveRrqType(prisma, value) {
  const raw = String(value || '').trim();
  if (!raw) return PRESALES_RRQ_TYPE;

  try {
    const types = await prisma.rRQType.findMany({ select: { typeName: true } });
    const hit = types.find((t) => t.typeName.toLowerCase() === raw.toLowerCase());
    if (hit) return hit.typeName;
  } catch (error) {
    // The master being unreadable must not stop an import; fall through.
    console.error('Could not read the RRQ type master:', error.message);
  }

  return LEGACY_QUEUE_SLUGS[raw.toLowerCase()] || PRESALES_RRQ_TYPE;
}

module.exports = {
  RESERVED_RRQ_TYPES,
  PRESALES_RRQ_TYPE,
  SALES_RRQ_TYPE,
  isReservedRrqType,
  resolveRrqType,
  LEGACY_QUEUE_SLUGS,
};
