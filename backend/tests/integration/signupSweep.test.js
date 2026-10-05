/*
 * The expired-signup sweep at the database layer.
 *
 * A Pending company whose verification token is past its 24h life can never be
 * activated, so the background job deletes it. This checks that it deletes
 * exactly those — not a live token, a Pending row with no token, or an Active
 * company.
 *
 * Needs a real (throwaway) database with the migrations applied:
 *   TEST_DATABASE_URL=postgresql://.../nexorcrm_test npm test
 * Skipped when TEST_DATABASE_URL is not set, so `npm test` works anywhere.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

test('expired sign-ups are swept, live ones are kept', { skip: !url && 'set TEST_DATABASE_URL to run' }, async () => {
  const prisma = require('../../prismaClient');
  const tenant = require('../../utils/tenant');
  const { sweepExpiredSignups } = require('../../utils/provisioning');

  const stamp = Date.now().toString(36);
  const past = new Date(Date.now() - 60 * 60 * 1000);
  const future = new Date(Date.now() + 60 * 60 * 1000);
  const mk = (suffix, data) => tenant.runAsSystem(() => prisma.company.create({
    data: {
      name: `Sweep ${suffix}`,
      slug: `sweep-${suffix}-${stamp}`,
      publicKey: `ks-${suffix}-${stamp}`,
      status: 'Pending',
      ...data,
    },
  }));

  const expiredA = await mk('a', { verificationToken: `tok-a-${stamp}`, verificationExpiresAt: past });
  const expiredB = await mk('b', { verificationToken: `tok-b-${stamp}`, verificationExpiresAt: past });
  const live = await mk('c', { verificationToken: `tok-c-${stamp}`, verificationExpiresAt: future });
  const noToken = await mk('d', {});
  const active = await mk('e', { status: 'Active' });
  const ids = [expiredA.id, expiredB.id, live.id, noToken.id, active.id];

  try {
    const removed = await sweepExpiredSignups({ now: new Date() });
    // Other suites may leave expired Pending rows behind, so this is a floor,
    // not an exact count.
    assert.ok(removed >= 2, `expected at least the two expired rows to go, removed ${removed}`);

    const left = await tenant.runAsSystem(() => prisma.company.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    }));
    const leftIds = left.map((c) => c.id).sort();
    assert.deepEqual(leftIds, [live.id, noToken.id, active.id].sort());
  } finally {
    await tenant.runAsSystem(() => prisma.company.deleteMany({ where: { id: { in: ids } } }));
  }
});
