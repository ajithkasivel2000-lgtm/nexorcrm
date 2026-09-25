const test = require('node:test');
const assert = require('node:assert/strict');
const { slotFor, dueKeyOf } = require('../../utils/reminders');

/**
 * The overdue series and its cap, in isolation.
 *
 * slotFor is pure — settings in, slot name out — so the whole cap behaviour
 * can be tested without a database. The dedup key lives in ReminderLog, so
 * these tests also pin the slot-name format the key is built from: the slot
 * is named by MINUTES LATE (floor(late/step) * step), so "overdue-0" is held
 * from one minute late up to the first interval, "overdue-60" from 60 to 119,
 * and so on.
 */

const NOW = new Date('2026-09-25T12:00:00.000Z');
const DUE = NOW.getTime();

const settings = {
  enabled: true,
  leadMinutes: 180,
  repeatMinutes: 30,
  maxReminders: 0,
  overdueEnabled: true,
  overdueRepeatMinutes: 60,
  escalateAfterMinutes: 120,
  maxOverdueReminders: 4,
};

/** Minutes late -> what slotFor answers. */
const late = (mins, overrides = {}) => slotFor(new Date(DUE - mins * 60000), NOW, { ...settings, ...overrides });

test('exactly due gets its own T-0 slot, not an overdue one', () => {
  assert.strictEqual(late(0), 'T-0');
});

test('the first overdue reminder lands on the first slot after due', () => {
  // One minute late: the first tick where the activity reads as overdue.
  assert.strictEqual(late(1), 'overdue-0');
  assert.strictEqual(late(30), 'overdue-0');
});

test('overdue slots repeat on the interval with the old key format', () => {
  // The key must stay minutes-late: ReminderLog rows already carry it, and
  // renaming the format would re-fire one duplicate per activity mid-chase.
  assert.strictEqual(late(60), 'overdue-60');
  assert.strictEqual(late(90), 'overdue-60');
  assert.strictEqual(late(150), 'overdue-120');
});

test('overdue stops once the cap is reached (default 4 -> overdue-0, -60, -120, -180, then nothing)', () => {
  assert.strictEqual(late(30), 'overdue-0');   // slot 1 of 4
  assert.strictEqual(late(90), 'overdue-60');  // slot 2 of 4
  assert.strictEqual(late(150), 'overdue-120'); // slot 3 of 4
  assert.strictEqual(late(210), 'overdue-180'); // slot 4 of 4
  assert.strictEqual(late(270), null);          // 5th refused
  assert.strictEqual(late(24 * 60), null);
});

test('overdue cap of 0 keeps the old uncapped behaviour', () => {
  assert.strictEqual(late(30, { maxOverdueReminders: 0 }), 'overdue-0');
  assert.strictEqual(late(24 * 60, { maxOverdueReminders: 0 }), 'overdue-1440');
  assert.strictEqual(late(7 * 24 * 60, { maxOverdueReminders: 0 }), 'overdue-10080');
});

test('overdue reminders off stops everything past due', () => {
  assert.strictEqual(late(1, { overdueEnabled: false }), null);
  assert.strictEqual(late(24 * 60, { overdueEnabled: false }), null);
});

test('the pre-due series is untouched by the overdue cap', () => {
  assert.strictEqual(slotFor(new Date(DUE + 30 * 60000), NOW, settings), 'T-30');
  assert.strictEqual(slotFor(new Date(DUE + 180 * 60000), NOW, settings), 'T-180');
  // Beyond the lead time: still nothing, as before.
  assert.strictEqual(slotFor(new Date(DUE + 181 * 60000), NOW, settings), null);
});

test('pre-due maxReminders cap still applies', () => {
  // cap 2 -> only T-180 and T-150; T-120 is the third and is refused.
  assert.strictEqual(slotFor(new Date(DUE + 150 * 60000), NOW, { ...settings, maxReminders: 2 }), 'T-150');
  assert.strictEqual(slotFor(new Date(DUE + 120 * 60000), NOW, { ...settings, maxReminders: 2 }), null);
});

test('a settings row saved before the cap existed reads as uncapped, not capped at nothing', () => {
  // undefined/NaN must not trip the cap (Number.isFinite guard) — fallback
  // rows that predate the column would otherwise send nothing at all.
  assert.strictEqual(late(30, { maxOverdueReminders: undefined }), 'overdue-0');
  assert.strictEqual(late(30 * 24 * 60, { maxOverdueReminders: undefined }), 'overdue-43200');
});

test('dueKeyOf stays minute-precision — the other half of the dedup key', () => {
  assert.strictEqual(dueKeyOf(new Date('2026-09-25T12:00:00.000Z')), '2026-09-25T12:00');
  assert.strictEqual(dueKeyOf(new Date('2026-09-25T12:00:59.999Z')), '2026-09-25T12:00');
});
