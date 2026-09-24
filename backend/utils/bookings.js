/**
 * Booking arithmetic: payment plans, what has been paid against which
 * milestone, what is overdue. Pure functions — the controller does the
 * database work — so the money rules can be tested on their own.
 *
 * Payments are not tied to a milestone when recorded (buyers pay lump sums
 * that rarely match a step exactly). They are applied to the milestones in
 * plan order, oldest first, which is how a collections team reads a ledger.
 */

/** Ready-made plans. Percentages of the agreement value; they must sum to 100. */
const PLAN_TEMPLATES = {
  'construction-linked': {
    label: 'Construction linked',
    steps: [
      ['On booking', 10], ['On agreement', 10], ['Plinth completion', 15],
      ['Slab completion', 25], ['Brickwork & plaster', 20], ['Finishing', 15], ['On possession', 5],
    ],
  },
  'down-payment': {
    label: 'Down payment (10 / 90)',
    steps: [['On booking', 10], ['Within 45 days', 90]],
  },
  'possession-linked': {
    label: 'Possession linked (20 / 80)',
    steps: [['On booking', 20], ['On possession', 80]],
  },
};

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Turn a plan into milestone rows. `steps` are { name, percent?, amount?,
 * dueDate? }; percentages are of agreementValue. Rounding is absorbed by the
 * last step, so the milestones always add up to the agreement value exactly.
 */
function buildMilestones(agreementValue, steps) {
  const total = round2(agreementValue);
  if (!(total > 0)) throw new Error('Agreement value must be more than zero.');
  if (!Array.isArray(steps) || steps.length === 0) throw new Error('A payment plan needs at least one step.');

  const rows = steps.map((step, i) => {
    const percent = step.percent != null && step.percent !== '' ? Number(step.percent) : null;
    const amount = percent != null ? round2((total * percent) / 100) : round2(step.amount);
    if (!step.name || !String(step.name).trim()) throw new Error(`Step ${i + 1} needs a name.`);
    if (!(amount >= 0)) throw new Error(`Step "${step.name}" needs a percentage or an amount.`);
    return {
      name: String(step.name).trim(),
      percent,
      amount,
      dueDate: step.dueDate ? new Date(step.dueDate) : null,
      sortOrder: i,
    };
  });

  const sum = round2(rows.reduce((s, r) => s + r.amount, 0));
  const drift = round2(total - sum);
  if (Math.abs(drift) > Math.max(1, total * 0.0001) && rows.every((r) => r.percent == null)) {
    throw new Error(`The steps add up to ${sum}, not the agreement value ${total}.`);
  }
  const pctTotal = rows.reduce((s, r) => s + (r.percent || 0), 0);
  if (rows.every((r) => r.percent != null) && Math.abs(pctTotal - 100) > 0.01) {
    throw new Error(`The percentages add up to ${pctTotal}%, not 100%.`);
  }
  rows[rows.length - 1].amount = round2(rows[rows.length - 1].amount + drift);
  return rows;
}

/** Steps for a named template. */
function templateSteps(key) {
  const plan = PLAN_TEMPLATES[key];
  if (!plan) throw new Error(`Unknown payment plan "${key}".`);
  return plan.steps.map(([name, percent]) => ({ name, percent }));
}

/**
 * Paid / outstanding / overdue for every milestone of a booking.
 * Payments fill milestones in plan order.
 */
function allocate(booking, now = new Date()) {
  const milestones = [...(booking.milestones || [])].sort((a, b) => a.sortOrder - b.sortOrder);
  let pool = round2((booking.payments || []).reduce((s, p) => s + Number(p.amount), 0));
  return milestones.map((m) => {
    const amount = Number(m.amount);
    const paid = round2(Math.min(pool, amount));
    pool = round2(pool - paid);
    const outstanding = round2(amount - paid);
    const overdue = outstanding > 0 && m.dueDate && new Date(m.dueDate) < now;
    return { id: m.id, name: m.name, amount, paid, outstanding, dueDate: m.dueDate, overdue: Boolean(overdue) };
  });
}

/** One milestone's state, given its booking (with milestones and payments). */
function milestoneStatus(milestone, booking, now = new Date()) {
  return allocate(booking, now).find((m) => m.id === milestone.id)
    || { paid: 0, outstanding: Number(milestone.amount), overdue: false };
}

/** Totals for a booking. */
function summarize(booking, now = new Date()) {
  const rows = allocate(booking, now);
  const agreementValue = Number(booking.agreementValue);
  const paid = round2((booking.payments || []).reduce((s, p) => s + Number(p.amount), 0));
  const overdue = round2(rows.filter((r) => r.overdue).reduce((s, r) => s + r.outstanding, 0));
  const next = rows.find((r) => r.outstanding > 0) || null;
  return {
    agreementValue,
    paid,
    balance: round2(agreementValue - paid),
    overdue,
    percentPaid: agreementValue > 0 ? Math.round((paid / agreementValue) * 1000) / 10 : 0,
    nextDue: next ? { name: next.name, dueDate: next.dueDate, outstanding: next.outstanding } : null,
    milestones: rows,
  };
}

/** Commission amount for a partner on an agreement value. */
const commissionFor = (agreementValue, percent) => round2((Number(agreementValue) * Number(percent)) / 100);

module.exports = {
  PLAN_TEMPLATES, buildMilestones, templateSteps, allocate, milestoneStatus, summarize, commissionFor, round2,
};
