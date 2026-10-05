const crypto = require('crypto');
const prisma = require('../prismaClient');
const tenant = require('./tenant');
const { verifyWebhookSignature } = require('./cashfree');
const { getCashfreeConfig } = require('./cashfreeConfig');

/**
 * SaaS billing: which plan a company is on, whether it may use the CRM, how
 * many users it may have, and the Cashfree calls that take the money.
 *
 * Subscription states (Company.subscriptionStatus):
 *   trialing   free trial until trialEndsAt (TRIAL_DAYS after sign-up)
 *   active     paid; renews through Cashfree
 *   past_due   a renewal failed — full access for GRACE_DAYS, then expired
 *   cancelled  stopped by the customer — access until currentPeriodEnd
 *   expired    trial or grace over — sign-in works, but only billing opens
 *   internal   the platform owner's own company: never billed, no limits
 *
 * Cashfree keys are the PLATFORM's (CASHFREE_APP_ID / CASHFREE_SECRET_KEY):
 * customers pay the platform owner. Without keys the
 * platform admin can still activate and extend companies by hand.
 */

const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 14);
const GRACE_DAYS = Number(process.env.BILLING_GRACE_DAYS || 7);
const GST_PERCENT = Number(process.env.BILLING_GST_PERCENT || 18);
const DAY = 86400000;

const cashfreeConfigured = () => Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY);

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

/* ---- Cashfree ------------------------------------------------------------ */

const cashfreeApiVersion = () => process.env.CASHFREE_SUBSCRIPTION_API_VERSION || '2025-01-01';

async function cashfree(path, { method = 'GET', body } = {}) {
  if (!cashfreeConfigured()) {
    throw Object.assign(new Error('Online payments are not set up yet. Contact the platform administrator.'), { status: 503 });
  }
  const { apiUrl } = getCashfreeConfig();
  let res;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      method,
      headers: {
        'x-client-id': process.env.CASHFREE_APP_ID,
        'x-client-secret': process.env.CASHFREE_SECRET_KEY,
        'x-api-version': cashfreeApiVersion(),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    console.error('[cashfree] request failed', JSON.stringify({
      endpoint: path,
      method,
      httpStatus: null,
      errorCode: null,
      requestId: null,
    }));
    throw Object.assign(new Error(`Cashfree network error: ${err.message}`), { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const providerCode = data?.code || data?.error?.code || data?.type;
    const requestId = res.headers?.get?.('x-request-id');
    console.error('[cashfree] request failed', JSON.stringify({
      endpoint: path,
      method,
      httpStatus: res.status,
      errorCode: providerCode || null,
      requestId: requestId || null,
    }));
    if (providerCode === 'profile_inactive') {
      throw Object.assign(
        new Error('Cashfree merchant profile is inactive or subscription service is not enabled.'),
        { status: 503, code: 'CASHFREE_PROFILE_INACTIVE' },
      );
    }
    let providerMessage = data?.message || data?.error?.description || `HTTP ${res.status}`;
    for (const credential of [process.env.CASHFREE_SECRET_KEY, process.env.CASHFREE_APP_ID]) {
      if (credential) providerMessage = providerMessage.split(credential).join('[redacted]');
    }
    const requestDetails = `${method} ${path} (${res.status}${providerCode ? ` ${providerCode}` : ''})`;
    throw Object.assign(
      new Error(`Cashfree ${requestDetails}: ${providerMessage}${requestId ? ` (request ${requestId})` : ''}`),
      { status: 502, code: providerCode },
    );
  }
  return data;
}

/** Make sure the monthly plan exists in Cashfree; creates it on first use. */
async function ensureCashfreePlan(plan, { forceRefresh = false } = {}) {
  const { environment } = getCashfreeConfig();
  const idSuffix = crypto.createHash('sha256')
    .update(`${plan.key}:${plan.pricePaise}:${GST_PERCENT}`)
    .digest('hex').slice(0, 10);
  const environmentPrefix = environment === 'PRODUCTION' ? 'prod' : 'sbx';
  const planId = `nx_${environmentPrefix}_${plan.key.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20)}_${idSuffix}`;
  if (!forceRefresh && plan.gatewayPlanId === planId) return planId;
  const amount = Math.round(plan.pricePaise * (1 + GST_PERCENT / 100)) / 100;
  const created = await cashfree('/plans', {
    method: 'POST',
    body: {
      plan_id: planId,
      plan_name: `NexorCRM ${plan.name}`.slice(0, 40),
      plan_type: 'PERIODIC',
      plan_currency: 'INR',
      plan_recurring_amount: amount,
      plan_max_amount: amount,
      plan_max_cycles: 120,
      plan_intervals: 1,
      plan_interval_type: 'MONTH',
    },
  });
  const savedPlanId = created.plan_id;
  if (typeof savedPlanId !== 'string' || !savedPlanId.trim()) {
    throw Object.assign(new Error('Cashfree did not return a plan ID after creating the plan.'), { status: 502 });
  }
  await tenant.runAsSystem(() => prisma.plan.update({ where: { id: plan.id }, data: { gatewayPlanId: savedPlanId } }));
  return savedPlanId;
}

/** Start a Cashfree subscription for the company; returns what checkout needs. */
async function createSubscription(company, plan, customerEmail) {
  const phoneDigits = String(company.phone || '').replace(/\D/g, '');
  if (phoneDigits.length < 10) {
    throw Object.assign(new Error('Add a 10-digit billing phone number before starting a Cashfree subscription.'), { status: 400 });
  }
  const phone = phoneDigits.slice(-10);
  let planId = await ensureCashfreePlan(plan);
  const subscriptionId = `nx_${company.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)}_${Date.now()}`;
  const returnUrl = process.env.CASHFREE_RETURN_URL
    || `${String(process.env.APP_URL || '').replace(/\/+$/, '')}/settings/billing`;
  const createCashfreeSubscription = (cashfreePlanId) => cashfree('/subscriptions', {
    method: 'POST',
    body: {
      subscription_id: subscriptionId,
      customer_details: {
        customer_name: (company.legalName || company.name).slice(0, 100),
        customer_email: customerEmail,
        customer_phone: phone,
      },
      plan_details: { plan_id: cashfreePlanId },
      authorization_details: {
        authorization_amount: 1,
        authorization_amount_refund: true,
      },
      subscription_meta: { return_url: returnUrl },
    },
  });
  let sub;
  try {
    sub = await createCashfreeSubscription(planId);
  } catch (error) {
    if (error.code !== 'plan_not_found') throw error;
    planId = await ensureCashfreePlan(plan, { forceRefresh: true });
    sub = await createCashfreeSubscription(planId);
  }
  if (!sub.subscription_session_id) {
    throw Object.assign(new Error('Cashfree did not return a subscription checkout session.'), { status: 502 });
  }
  await tenant.runAsSystem(() => prisma.company.update({
    where: { id: company.id },
    data: { subscriptionGatewayId: subscriptionId, planKey: plan.key },
  }));
  return {
    subscriptionId,
    subscriptionSessionId: sub.subscription_session_id,
    mode: getCashfreeConfig().mode,
  };
}

/** Verify a subscription's current state directly with Cashfree. */
async function verifySubscription(subscriptionId) {
  const sub = await cashfree(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
  return sub;
}

/* ---- invoices ------------------------------------------------------------ */

async function nextInvoiceNumber() {
  const year = new Date().getFullYear();
  const count = await tenant.runAsSystem(() => prisma.invoice.count({ where: { number: { startsWith: `INV-${year}-` } } }));
  return `INV-${year}-${String(count + 1).padStart(5, '0')}`;
}

/**
 * Record a paid period for a company and move it to active until periodEnd.
 * Idempotent on gatewayPaymentId: Cashfree retries webhooks.
 */
async function recordPayment(company, plan, { paymentId = null, periodStart = new Date(), periodEnd, description } = {}) {
  if (paymentId) {
    const seen = await tenant.runAsSystem(() => prisma.invoice.findUnique({ where: { gatewayPaymentId: paymentId } }));
    if (seen) return seen;
  }
  const end = periodEnd || new Date(new Date(periodStart).getTime() + 30 * DAY);
  const amount = plan ? plan.pricePaise : 0;
  /* Idempotent under concurrency: a replayed webhook racing the first one hits
     the unique payment id and gets the existing invoice back; two different
     payments picking the same next number simply retry with the one after. */
  let invoice = null;
  for (let attempt = 0; attempt < 5 && !invoice; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      invoice = await createInvoiceRow();
    } catch (error) {
      if (error.code !== 'P2002') throw error;
      if (paymentId) {
        // eslint-disable-next-line no-await-in-loop
        const existing = await tenant.runAsSystem(() => prisma.invoice.findUnique({ where: { gatewayPaymentId: paymentId } }));
        if (existing) return existing;
      }
    }
  }
  if (!invoice) throw new Error('Could not allocate an invoice number.');

  async function createInvoiceRow() {
    return tenant.runAsSystem(async () => prisma.invoice.create({
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
        gatewayPaymentId: paymentId,
        paidAt: new Date(),
      },
    }));
  }
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
  cashfreeConfigured, cashfree, accessFor, planFor, seatsUsed, assertSeatAvailable, trialEndOf,
  createSubscription, verifySubscription,
  verifyWebhookSignature: (rawBody, signature, timestamp) => verifyWebhookSignature(
    rawBody, signature, timestamp, process.env.CASHFREE_SECRET_KEY,
  ),
  recordPayment,
  sweepSubscription,
};
