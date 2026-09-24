const { PrismaClient, Prisma } = require('@prisma/client');
const crypto = require('crypto');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { prefixFor, mirrorFor, createAllocator } = require('./utils/refId');
const tenant = require('./utils/tenant');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const base = new PrismaClient({ adapter });

/**
 * Relation field -> the model it points at, e.g. lead.logs -> leadLog.
 *
 * Read from Prisma's own schema rather than written out by hand, so a relation
 * added later is covered without anyone remembering this file exists.
 */
const lower = (name) => name.charAt(0).toLowerCase() + name.slice(1);

const RELATIONS = new Map();
for (const model of Prisma.dmmf.datamodel.models) {
  const fields = {};
  for (const field of model.fields) {
    if (field.kind === 'object') fields[field.name] = lower(field.type);
  }
  RELATIONS.set(lower(model.name), fields);
}

/**
 * Copies the write payload so the caller's object is never modified.
 *
 * Only plain objects and arrays are copied. A Date, a Buffer or a Decimal is
 * passed through by reference, because rebuilding one generically is how a
 * clone quietly turns a date column into an empty object.
 */
function clonePayload(value) {
  if (Array.isArray(value)) return value.map(clonePayload);
  if (value && value.constructor === Object) {
    const out = {};
    for (const [key, inner] of Object.entries(value)) out[key] = clonePayload(inner);
    return out;
  }
  return value;
}

/**
 * Fills in the id on a row about to be written, and on anything nested under
 * it.
 *
 * Nested rows are the reason this recurses: `lead.create` with a first log
 * entry attached writes two rows, and the extension only fires for the lead.
 * Without this the log would fall back to the uuid default and one table would
 * end up holding both formats.
 *
 * `assignSelf` is false on an update, where the row already has an id and
 * writing a new one would move the record.
 *
 * Mutates and returns `data`.
 */
async function assignIds(allocate, model, data, assignSelf = true) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    for (const row of data) await assignIds(allocate, model, row, assignSelf);
    return data;
  }

  if (assignSelf && prefixFor(model) && !data.id) {
    const id = await allocate(model);
    if (id) data.id = id;
  }

  // A few tables carry the id a second time under an older column name the
  // screens read. It always gets the id, never a format of its own — the Add
  // Property form still offers a "Property ID" box, and one record showing two
  // different ids is the thing this is meant to end.
  const mirror = mirrorFor(model);
  if (mirror && data.id) data[mirror] = data.id;

  const relations = RELATIONS.get(model) || {};
  for (const [field, target] of Object.entries(relations)) {
    const nested = data[field];
    if (!nested || typeof nested !== 'object') continue;

    // The three shapes a nested write takes. `connect` is left alone — it
    // points at a row that already exists.
    if (nested.create) await assignIds(allocate, target, nested.create);
    if (nested.createMany?.data) await assignIds(allocate, target, nested.createMany.data);
    if (nested.connectOrCreate) {
      const entries = Array.isArray(nested.connectOrCreate)
        ? nested.connectOrCreate
        : [nested.connectOrCreate];
      for (const entry of entries) {
        if (entry?.create) await assignIds(allocate, target, entry.create);
      }
    }
  }

  return data;
}

/** How many times to re-pick an id after two writes land on the same number. */
const ID_RETRIES = 3;

/** True when Prisma rejected a write because the id was already taken. */
const isIdCollision = (error) =>
  error?.code === 'P2002' && [].concat(error.meta?.target || []).includes('id');

/**
 * Every new record gets a readable id — LED-2026-001, USR-2026-001 — without
 * any controller having to remember.
 *
 * Done here rather than at the ~40 individual create sites: one of those would
 * have been missed, and a record falling back to a uuid is worse than none at
 * all, because the format stops being something you can rely on.
 *
 * The number comes from counting what is already there, so two requests
 * arriving together can pick the same one. That loses a race rarely and costs
 * one retry when it happens, which is a better trade than a sequence table
 * nobody would maintain.
 *
 * `base` is used for the lookups so they don't re-enter this extension.
 */
const withIds = base.$extends({
  query: {
    $allModels: {
      async create({ model, args, query }) {
        const key = lower(model);

        for (let attempt = 0; ; attempt += 1) {
          const allocate = createAllocator(base);
          const data = await assignIds(allocate, key, clonePayload(args.data));
          /* A session's id is the bearer token itself: 256 random bits, never
             a readable counter. */
          if (key === 'session' && !data.id) data.id = crypto.randomBytes(32).toString('hex');

          try {
            return await query({ ...args, data });
          } catch (error) {
            // Only retry an id this file chose. A caller that passed its own
            // id, or a clash on some other unique column, is a real error.
            if (attempt >= ID_RETRIES || args.data?.id || !isIdCollision(error)) throw error;
          }
        }
      },

      async update({ model, args, query }) {
        // An update never rewrites the row's own id, but it can carry new
        // nested rows — a log entry appended to a lead — which do need one.
        const allocate = createAllocator(base);
        const data = await assignIds(allocate, lower(model), clonePayload(args.data), false);
        return query({ ...args, data });
      },
    },
  },
});

/* ---------------------------------------------------------------------------
   Multi-company scoping.

   Every table but these carries companyId. The company comes from the request's
   tenant context (utils/tenant.js): reads are filtered to it and writes are
   stamped with it, here, once — so no controller can forget, and a row from
   one company can never be read, changed or deleted from another.
   --------------------------------------------------------------------------- */
const TENANT_FREE = new Set(['company', 'passwordResetToken']);

const WHERE_OPS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'updateManyAndReturn',
  'upsert', 'delete', 'deleteMany',
]);
const READ_OPS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'count', 'aggregate', 'groupBy',
]);

/** Stamp one row about to be created, and every row nested inside it. */
function stampCreate(model, row, companyId) {
  if (!row || typeof row !== 'object') return;
  if (Array.isArray(row)) { row.forEach((r) => stampCreate(model, r, companyId)); return; }
  if (!TENANT_FREE.has(model)) {
    if (row.companyId && row.companyId !== companyId) {
      throw new Error(`Refusing to write ${model} into another company`);
    }
    row.companyId = companyId;
  }
  stampNested(model, row, companyId);
}

/** Walk relation fields of a create/update payload for nested creates. */
function stampNested(model, data, companyId) {
  const relations = RELATIONS.get(model) || {};
  for (const [field, target] of Object.entries(relations)) {
    const nested = data[field];
    if (!nested || typeof nested !== 'object') continue;
    if (nested.create) stampCreate(target, nested.create, companyId);
    if (nested.createMany?.data) stampCreate(target, nested.createMany.data, companyId);
    for (const entry of [].concat(nested.connectOrCreate || [])) {
      if (entry?.create) stampCreate(target, entry.create, companyId);
    }
    for (const entry of [].concat(nested.upsert || [])) {
      if (entry?.create) stampCreate(target, entry.create, companyId);
      if (entry?.update) stampUpdate(target, entry.update, companyId);
    }
    for (const entry of [].concat(nested.update || [])) {
      if (entry?.data) stampUpdate(target, entry.data, companyId);
    }
  }
}

/** An update may not move a row to another company; nested creates are stamped. */
function stampUpdate(model, data, companyId) {
  if (!data || typeof data !== 'object') return;
  delete data.companyId;
  stampNested(model, data, companyId);
}

const prisma = withIds.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const key = lower(model);
        if (TENANT_FREE.has(key)) return query(args);

        const ctx = tenant.current();
        if (!ctx) {
          throw new Error(`No company context for ${model}.${operation}. `
            + 'Run it inside a request, or wrap it in runWithCompany().');
        }
        // Platform work, and entry points still finding their company, read
        // across companies; neither may write until the company is known.
        if (ctx.system || (ctx.resolving && !ctx.companyId)) {
          if (READ_OPS.has(operation)) return query(args);
          if (ctx.system) return query(args); // writes must carry companyId themselves
          throw new Error(`${model}.${operation} before the company is known`);
        }

        const { companyId } = ctx;
        const next = clonePayload(args || {});
        if (WHERE_OPS.has(operation)) next.where = { ...(next.where || {}), companyId };

        switch (operation) {
          case 'create':
          case 'createMany':
          case 'createManyAndReturn':
            stampCreate(key, next.data, companyId);
            break;
          case 'update':
          case 'updateMany':
          case 'updateManyAndReturn':
            stampUpdate(key, next.data, companyId);
            break;
          case 'upsert':
            stampCreate(key, next.create, companyId);
            stampUpdate(key, next.update, companyId);
            break;
          default:
            break;
        }
        return query(next);
      },
    },
  },
});

module.exports = prisma;
