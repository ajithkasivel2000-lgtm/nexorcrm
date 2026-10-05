const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { slotFor, verifyWebhookSignature } = require('../../utils/collections');

const settings = { daysBefore: [7, 1], overdueEveryDays: 7, maxOverdue: 3 };
const now = new Date(2026, 8, 25, 11, 0, 0);
const dueIn = (days, outstanding = 1000) => ({ dueDate: new Date(2026, 8, 25 + days, 0, 0, 0), outstanding });

test('reminders go out on the chosen days before the due date', () => {
  assert.strictEqual(slotFor(dueIn(7), settings, now), 'before-7');
  assert.strictEqual(slotFor(dueIn(1), settings, now), 'before-1');
  assert.strictEqual(slotFor(dueIn(3), settings, now), null);
  assert.strictEqual(slotFor(dueIn(0), settings, now), null);
  assert.strictEqual(slotFor(dueIn(0), { ...settings, daysBefore: [0] }, now), 'before-0');
});

test('overdue reminders repeat on the interval, up to the limit', () => {
  assert.strictEqual(slotFor(dueIn(-1), settings, now), 'overdue-1');
  assert.strictEqual(slotFor(dueIn(-2), settings, now), null);
  assert.strictEqual(slotFor(dueIn(-8), settings, now), 'overdue-2');
  assert.strictEqual(slotFor(dueIn(-15), settings, now), 'overdue-3');
  assert.strictEqual(slotFor(dueIn(-22), settings, now), null); // past maxOverdue
  assert.strictEqual(slotFor(dueIn(-3), { ...settings, overdueEveryDays: 1 }, now), 'overdue-3');
});

test('nothing is sent for a paid milestone or one with no due date', () => {
  assert.strictEqual(slotFor(dueIn(7, 0), settings, now), null);
  assert.strictEqual(slotFor({ dueDate: null, outstanding: 500 }, settings, now), null);
});

test('payment webhooks must carry a valid signature', () => {
  const timestamp = '1725899940000';
  const body = Buffer.from('{"event":"payment_link.paid"}');
  const good = crypto.createHmac('sha256', 'secret').update(`${timestamp}${body}`).digest('base64');
  assert.ok(verifyWebhookSignature(body, good, timestamp, 'secret'));
  assert.ok(!verifyWebhookSignature(body, good, timestamp, 'other'));
  assert.ok(!verifyWebhookSignature(body, 'abc', timestamp, 'secret'));
  assert.ok(!verifyWebhookSignature(body, good, '', 'secret'));
});
