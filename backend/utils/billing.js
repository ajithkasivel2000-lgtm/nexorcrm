const crypto = require('crypto');
const prisma = require('../prismaClient');
const tenant = require('./tenant');

/**
 * SaaS billing: which plan a company is on, whether it may use the CRM, how
 * many users it may have, and the Razorpay calls that take the money.
 *
 * Subscription states (Company.subscriptionStatus):
 *   trialing   free trial until trialEndsAt (TRIAL_DAYS after sign-up)
 *   active     paid; renews through Razorpay
 *   past_due   a renewal failed — full access for GRACE_DAYS, then expired
 *   cancelled  stopped by the customer — access until currentPeriodEnd
 *   expired    trial or grace over — sign-in works, but only billing opens
 *   internal   the platform owner's own company: never billed, no limits
 *
 * Razorpay keys are the PLATFORM's (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET /
 * RAZORPAY_WEBHOOK_SECRET): customers pay the platform owner. Without keys the
 * platform admin can still activate and extend companies by hand.
 */

const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 14);
const GRACE_DAYS = Number(process.env.BILLING_GRACE_DAYS || 7);
const GST_PERCENT = Number(process.env.BILLING_GST_PERCENT || 18);
const DAY = 86400000;

const razorpayConfigured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

/** Statuses that count against a plan's user limit. */
const SEAT_EXCLUDED = ['Archived', 'Banned', 'Partner', 'Registered', 'Pending', 'Suspended'];

const trialEndOf = (company) => company.trialEndsAt
  || new Date(new Date(company.createdAt).getTime() + TRIAL_DAYS * DAY);

/**
 * Whether the company may use the CRM right now, and why not.
 * @returns {{ allowed: boolean, reason?: string, daysLeft?: number, state: string }}
 */
function accessFor(company, now = new Date()) {
  const status = company.subscriptionStatus || 'trialing';
  if (status === 'internal') return { allowed: true, state: 'internal' };
  if (status === 'active') return { allowed: true, state: 'active' };
  if (status === 'trialing') {
    const end = trialEndOf(company);
    const daysLeft = Math.ceil((end - now) / DAY);
    return daysLeft > 0
      ? { allowed: true, state: 'trialing', daysLeft }
      : { allowed: false, state: 'expired', reason: 'Your free trial has ended. Choose a plan to keep using NexorCRM.' };
  }
  if (status === 'past_due') {
    const since = company.currentPeriodEnd || company.updatedAt;
    const daysLeft = Math.ceil((new Date(since).getTime() + GRACE_DAYS * DAY - now) / DAY);
    return daysLeft > 0
      ? { allowed: true, state: 'past_due', daysLeft }
      : { allowed: false, state: 'expired', reason: 'Your last payment failed. Update your payment to continue.' };
  }
  if (status === 'cancelled') {
    return company.currentPeriodEnd && new Date(company.currentPeriodEnd) > now
      ? { allowed: true, state: 'cancelled', daysLeft: Math.ceil((new Date(company.currentPeriodEnd) - now) / DAY) }
      : { allowed: false, state: 'expired', reason: 'Your subscription has ended. Choose a plan to continue.' };
  }
  return { allowed: false, state: 'expired', reason: 'Your subscription is not active. Choose a plan to continue.' };
}

/** The plan row for a company, or null (internal / not chosen yet). */
async function planFor(company) {
  if (!company?.planKey) return null;
  return tenant.runAsSystem(() => prisma.plan.findUnique({ where: { key: company.planKey } }));
}

/** Active staff accounts in the current company. */
function seatsUsed() {
  return prisma.user.count({ where: { status: { notIn: SEAT_EXCLUDED }, archivedAt: null } });
}

/**
 * Throws a 402 when adding `adding` more active users would pass the plan's
 * limit. Trials get the limit of the plan they picked, or Growth's if none.
 */
async function assertSeatAvailable(companyId, adding = 1) {
  const company = await tenant.runAsSystem(() => prisma.company.findUnique({ where: { id: companyId } }));
  if (!company || company.subscriptionStatus === 'internal') return;
  const plan = (await planFor(company))
    || await tenant.runAsSystem(() => prisma.plan.findUnique({ where: { key: 'growth' } }));
  if (!plan || !plan.maxUsers) return;
  const used = await seatsUsed();
  if (used + adding > plan.maxUsers) {
    throw Object.assign(
      new Error(`Your ${plan.name} plan allows ${plan.maxUsers} active users and you have ${used}. Upgrade the plan to add more.`),
      { status: 402 },
    );
  }
}

/* ---- Razorpay ------------------------------------------------------------ */

async function razorpay(path, { method = 'GET', body } = {}) {
  if (!razorpayConfigured()) {
    throw Object.assign(new Error('Online payments are not set up yet. Contact the platform administrator.'), { status: 503 });
  }
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(`Razorpay: ${data?.error?.description || res.status}`), { status: 502 });
  }
  return data;
}

/** Make sure the plan exists in Razorpay; creates it on first use. */
async function ensureRazorpayPlan(plan) {
  if (plan.razorpayPlanId) return plan.razorpayPlanId;
  const created = await razorpay('/plans', {
    method: 'POST',
    body: {
      period: 'monthly',
      interval: 1,
      item: {
        name: `NexorCRM ${plan.name}`,
        amount: Math.round(plan.pricePaise * (1 + GST_PERCENT / 100)),
        currency: 'INR',
        description: `${plan.name} plan, monthly, incl. ${GST_PERCENT}% GST`,
      },
      notes: { planKey: plan.key },
    },
  });
  await tenant.runAsSystem(() => prisma.plan.update({ where: { id: plan.id }, data: { razorpayPlanId: created.id } }));
  return created.id;
}

/** Start a Razorpay subscription for the company; returns what Checkout needs. */
async function createSubscription(company, plan) {
  const planId = await ensureRazorpayPlan(plan);
  const sub = await razorpay('/subscriptions', {
    method: 'POST',
    body: {
      plan_id: planId,
      total_count: 120, // ten years of monthly charges; cancelling ends it sooner
      customer_notify: 1,
      notes: { companyId: company.id, planKey: plan.key },
    },
  });
  await tenant.runAsSystem(() => prisma.company.update({
    where: { id: company.id },
    data: { razorpaySubscriptionId: sub.id, planKey: plan.key },
  }));
  return { subscriptionId: sub.id, keyId: process.env.RAZORPAY_KEY_ID };
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

/** Checkout's success callback: payment_id|subscription_id signed with the key secret. */
function verifyCheckoutSignature({ paymentId, subscriptionId, signature }) {
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
    .update(`${paymentId}|${subscriptionId}`).digest('hex');
  return safeEqual(expected, signature);
}

/** Webhooks: the raw body signed with the webhook secret. */
function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

/* ---- invoices ------------------------------------------------------------ */

async function nextInvoiceNumber() {
  const year = new Date().getFullYear();
  const count = await tenant.runAsSystem(() => prisma.invoice.count({ where: { number: { startsWith: `INV-${year}-` } } }));
  return `INV-${year}-${String(count + 1).padStart(5, '0')}`;
}

/**
 * Record a paid period for a company and move it to active until periodEnd.
 * Idempotent on razorpayPaymentId: Razorpay retries webhooks.
 */
async function recordPayment(company, plan, { paymentId = null, periodStart = new Date(), periodEnd, description } = {}) {
  if (paymentId) {
    const seen = await tenant.runAsSystem(() => prisma.invoice.findUnique({ where: { razorpayPaymentId: paymentId } }));
    if (seen) return seen;
  }
  const end = periodEnd || new Date(new Date(periodStart).getTime() + 30 * DAY);
  const amount = plan ? plan.pricePaise : 0;
  const invoice = await tenant.runAsSystem(async () => prisma.invoice.create({
    data: {
      companyId: company.id,
      number: await nextInvoiceNumber(),
      planKey: plan?.key || null,
      description: description || `${plan ? plan.name : 'Subscription'} plan — ${new Date(periodStart).toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`,
      amountPaise: amount,
      gstPercent: GST_PERCENT,
      totalPaise: Math.round(amount * (1 + GST_PERCENT / 100)),
      status: 'paid',
      periodStart,
      periodEnd: end,
      razorpayPaymentId: paymentId,
      paidAt: new Date(),
    },
  }));
  await tenant.runAsSystem(() => prisma.company.update({
    where: { id: company.id },
    data: { subscriptionStatus: 'active', currentPeriodEnd: end, planKey: plan?.key || company.planKey },
  }));
  return invoice;
}

/**
 * Daily housekeeping, run by the background job for each company: expire
 * finished trials and lapsed grace periods so the state on record is true.
 */
async function sweepSubscription(companyId) {
  const company = await tenant.runAsSystem(() => prisma.company.findUnique({ where: { id: companyId } }));
  if (!company || ['internal', 'expired'].includes(company.subscriptionStatus)) return null;
  const access = accessFor(company);
  if (!access.allowed) {
    await tenant.runAsSystem(() => prisma.company.update({ where: { id: companyId }, data: { subscriptionStatus: 'expired' } }));
    return 'expired';
  }
  return null;
}

module.exports = {
  TRIAL_DAYS, GRACE_DAYS, GST_PERCENT, SEAT_EXCLUDED,
  razorpayConfigured, accessFor, planFor, seatsUsed, assertSeatAvailable, trialEndOf,
  createSubscription, verifyCheckoutSignature, verifyWebhookSignature, recordPayment,
  sweepSubscription, razorpay,
};
