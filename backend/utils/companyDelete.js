const { Prisma } = require('@prisma/client');
const prisma = require('../prismaClient');
const tenant = require('./tenant');

/**
 * Permanently delete client companies and everything they own.
 *
 * Every table but Company, Plan and PasswordResetToken carries companyId, so
 * a company's data is "every row with its companyId". The tables are read
 * from Prisma's own schema, so one added later is covered without anyone
 * remembering this file. Rows are removed children-first (a payment before
 * its booking), all in one transaction: it all goes, or nothing does.
 *
 * Only the platform owner calls this (platformController), and only for a
 * company that is already Suspended, so deleting is always a second step.
 */

const lower = (name) => name.charAt(0).toLowerCase() + name.slice(1);
const MODELS = Prisma.dmmf.datamodel.models;
const TENANT_MODELS = MODELS.filter((m) => m.fields.some((f) => f.name === 'companyId')).map((m) => m.name);

/**
 * Which tables each table points at, read from schema.prisma: the side of a
 * relation written `@relation(fields: [...])` holds the foreign key. (The
 * schema Prisma 7 ships at runtime leaves that detail out.)
 */
function foreignKeys() {
  const text = require('fs').readFileSync(require('path').join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const map = new Map();
  for (const [, model, body] of text.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const targets = new Set();
    for (const [, type] of body.matchAll(/^\s*\w+\s+(\w+)\??\s+@relation\([^)]*fields:/gm)) targets.add(type);
    map.set(model, targets);
  }
  return map;
}

/** Tenant tables in an order where each comes before any table it points at. */
const DELETE_ORDER = (() => {
  const fks = foreignKeys();
  const parents = new Map(TENANT_MODELS.map((name) => [name, new Set()]));
  for (const name of TENANT_MODELS) {
    for (const target of fks.get(name) || []) {
      if (target !== name && parents.has(target)) parents.get(name).add(target);
    }
  }
  // Children first: a table is deleted once nothing left still points at it.
  const order = [];
  const left = new Set(TENANT_MODELS);
  while (left.size) {
    const ready = [...left].filter((name) => ![...left].some((other) => other !== name && parents.get(other).has(name)));
    if (!ready.length) throw new Error(`Cannot order company tables for deletion: ${[...left].join(', ')}`);
    for (const name of ready) { order.push(name); left.delete(name); }
  }
  return order.map(lower);
})();

/**
 * Deletes the companies' rows, then the companies. Returns rows removed per
 * table. Stored files (documents, logos) are removed afterwards, best effort.
 */
async function deleteCompanies(ids) {
  return tenant.runAsSystem(async () => {
    const where = { companyId: { in: ids } };
    const [docs, companies, users] = await Promise.all([
      prisma.document.findMany({ where, select: { storedName: true } }),
      prisma.company.findMany({ where: { id: { in: ids } }, select: { logoKey: true } }),
      prisma.user.findMany({ where, select: { id: true } }),
    ]);

    const removed = {};
    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
      for (const model of DELETE_ORDER) {
        const { count } = await tx[model].deleteMany({ where });
        if (count) removed[model] = count;
      }
      removed.company = (await tx.company.deleteMany({ where: { id: { in: ids } } })).count;
    }, { timeout: 120000 });

    const storage = require('./storage');
    const files = [...docs.map((d) => d.storedName), ...companies.map((c) => c.logoKey)].filter(Boolean);
    for (const key of files) await storage.remove(key).catch(() => {});
    return removed;
  });
}

module.exports = { deleteCompanies, DELETE_ORDER };
