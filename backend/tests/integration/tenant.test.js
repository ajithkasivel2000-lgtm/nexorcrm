/*
 * Multi-company isolation at the database layer.
 *
 * Needs a real (throwaway) database with the migrations applied:
 *   TEST_DATABASE_URL=postgresql://.../nexorcrm_test npm test
 * Skipped when TEST_DATABASE_URL is not set, so `npm test` works anywhere.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

test('multi-company isolation', { skip: !url && 'set TEST_DATABASE_URL to run' }, async (t) => {
  const prisma = require('../../prismaClient');
  const tenant = require('../../utils/tenant');
  const stamp = Date.now().toString(36);
  const a = await tenant.runAsSystem(() => prisma.company.create({ data: { name: 'Test A', slug: `test-a-${stamp}`, publicKey: `ka-${stamp}` } }));
  const b = await tenant.runAsSystem(() => prisma.company.create({ data: { name: 'Test B', slug: `test-b-${stamp}`, publicKey: `kb-${stamp}` } }));

  try {
    const deptA = await tenant.runWithCompany(a.id, () => prisma.department.create({ data: { name: 'Sales' } }));

    await t.test('rows are stamped with the company that wrote them', () => {
      assert.equal(deptA.companyId, a.id);
    });

    await t.test('the same name can exist in two companies', async () => {
      const deptB = await tenant.runWithCompany(b.id, () => prisma.department.create({ data: { name: 'Sales' } }));
      assert.equal(deptB.companyId, b.id);
    });

    await t.test('another company cannot read, update or delete the row', async () => {
      await tenant.runWithCompany(b.id, async () => {
        assert.equal(await prisma.department.findUnique({ where: { id: deptA.id } }), null);
        assert.equal((await prisma.department.updateMany({ where: { id: deptA.id }, data: { name: 'x' } })).count, 0);
        assert.equal((await prisma.department.deleteMany({ where: { id: deptA.id } })).count, 0);
        await assert.rejects(prisma.department.update({ where: { id: deptA.id }, data: { name: 'x' } }));
      });
    });

    await t.test('a write cannot be pointed at another company', async () => {
      await assert.rejects(
        tenant.runWithCompany(b.id, () => prisma.department.create({ data: { name: 'Sneaky', companyId: a.id } })),
        /another company/,
      );
    });

    await t.test('an update cannot move a row to another company', async () => {
      const moved = await tenant.runWithCompany(a.id, () => prisma.department.update({ where: { id: deptA.id }, data: { companyId: b.id } }));
      assert.equal(moved.companyId, a.id);
    });

    await t.test('no company context is an error, not "everything"', async () => {
      await assert.rejects(prisma.department.findMany(), /No company context/);
    });

    await t.test('resolving mode reads but cannot write until the company is known', async () => {
      await tenant.runResolving(async () => {
        await assert.rejects(prisma.department.create({ data: { name: 'x' } }), /company is known/);
        tenant.adopt(a.id);
        assert.equal((await prisma.department.count()), 1);
      });
    });
  } finally {
    for (const c of [a, b]) {
      await tenant.runWithCompany(c.id, () => prisma.department.deleteMany({}));
    }
    await tenant.runAsSystem(() => prisma.company.deleteMany({ where: { id: { in: [a.id, b.id] } } }));
  }
});
