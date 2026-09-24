const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildMilestones, templateSteps, summarize, allocate, commissionFor, PLAN_TEMPLATES,
} = require('../../utils/bookings');

test('every ready-made plan adds up to 100%', () => {
  for (const [key, plan] of Object.entries(PLAN_TEMPLATES)) {
    const total = plan.steps.reduce((s, [, pct]) => s + pct, 0);
    assert.equal(total, 100, key);
  }
});

test('milestones always add up to the agreement value exactly', () => {
  // A value that does not divide evenly: rounding goes to the last step.
  const rows = buildMilestones(3333333, templateSteps('construction-linked'));
  const sum = rows.reduce((s, r) => s + r.amount, 0);
  assert.equal(Math.round(sum * 100) / 100, 3333333);
});

test('percentages that do not add up to 100 are refused', () => {
  assert.throws(() => buildMilestones(1000, [{ name: 'A', percent: 50 }, { name: 'B', percent: 40 }]), /90%/);
});

test('a plan needs a name on every step and a positive value', () => {
  assert.throws(() => buildMilestones(1000, [{ name: '', percent: 100 }]), /needs a name/);
  assert.throws(() => buildMilestones(0, [{ name: 'A', percent: 100 }]), /more than zero/);
});

test('payments fill milestones oldest first and overdue is what is late and unpaid', () => {
  const now = new Date('2026-06-01');
  const booking = {
    agreementValue: 1000,
    milestones: [
      { id: 'm1', name: 'Booking', amount: 100, sortOrder: 0, dueDate: new Date('2026-01-01') },
      { id: 'm2', name: 'Plinth', amount: 400, sortOrder: 1, dueDate: new Date('2026-03-01') },
      { id: 'm3', name: 'Possession', amount: 500, sortOrder: 2, dueDate: new Date('2026-12-01') },
    ],
    payments: [{ amount: 250 }],
  };
  const rows = allocate(booking, now);
  assert.deepEqual(rows.map((r) => r.paid), [100, 150, 0]);
  assert.deepEqual(rows.map((r) => r.overdue), [false, true, false]);
  const s = summarize(booking, now);
  assert.equal(s.paid, 250);
  assert.equal(s.balance, 750);
  assert.equal(s.overdue, 250);
  assert.equal(s.percentPaid, 25);
  assert.equal(s.nextDue.name, 'Plinth');
});

test('commission is a percentage of the agreement value', () => {
  assert.equal(commissionFor(7500000, 2), 150000);
  assert.equal(commissionFor(1000, 1.5), 15);
});
