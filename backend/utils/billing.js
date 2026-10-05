const prisma = require('../prismaClient');
const tenant = require('./tenant');
const { verifyWebhookSignature } = require('./cashfree');
const { getCashfreeConfig } = require('./cashfreeConfig');
const crypto = require('crypto');

/**
 * SaaS billing: which plan a company is on, whether it may use the CRM, how
 * many users it may have, and the Cashfree calls that take the money.
 *
 * Subscription states (Company.subscriptionStatus):
 *   pending_payment   Cashfree mandate authorisation is required
 *   trialing   authorised subscription; first recurring debit is scheduled
 *   at trialEndsAt
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
  if (status === 'pending_payment') {
    return { allowed: false, state: 'pending_payment', reason: 'Complete Cashfree payment authorization to start your trial.' };
  }
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

function subscriptionIsAuthorized(subscription) {
  return subscription?.subscription_status === 'ACTIVE'
    || subscription?.subscription_details?.subscription_status === 'ACTIVE';
}

function authorizationStatusOf(subscription) {
  return subscription?.authorization_details?.authorization_status
    || subscription?.authorisation_details?.authorization_status
    || subscription?.authorization_status
    || null;
}

function subscriptionStatusOf(subscription) {
  return subscription?.subscription_status
    || subscription?.subscription_details?.subscription_status
    || null;
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

async function cashfree(path, { method = 'GET', body, idempotencyKey, apiVersion = cashfreeApiVersion() } = {}) {
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
        'x-api-version': apiVersion,
        ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
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

/** Start a Cashfree subscription for the company; returns what checkout needs. */
async function createSubscription(company, plan, customerEmail, { startTrial = false } = {}) {
  const phoneDigits = String(company.phone || '').replace(/\D/g, '');
  if (phoneDigits.length < 10) {
    throw Object.assign(new Error('Add a 10-digit billing phone number before starting a Cashfree subscription.'), { status: 400 });
  }
  const phone = phoneDigits.slice(-10);
  const monthlyAmount = Math.round(plan.pricePaise * (1 + GST_PERCENT / 100)) / 100;
  const samePendingAttempt = company.subscriptionGatewayId
    && company.subscriptionRequestKey
    && company.planKey === plan.key
    && !['FAILED', 'CANCELLED', 'EXPIRED', 'LINK_EXPIRED'].includes(String(company.authorizationStatus || '').toUpperCase())
    && !['expired', 'cancelled'].includes(company.subscriptionStatus);
  const signupTrialEnd = startTrial && company.signupRequestKey && company.trialEndsAt
    ? new Date(company.trialEndsAt)
    : null;
  if (signupTrialEnd && signupTrialEnd <= new Date()) {
    throw Object.assign(
      new Error('The signup trial authorization window has ended. Contact the platform administrator to continue.'),
      { status: 409 },
    );
  }
  if (samePendingAttempt && company.subscriptionSessionId) {
    return {
      subscriptionId: company.subscriptionGatewayId,
      subscriptionSessionId: company.subscriptionSessionId,
      mode: getCashfreeConfig().mode,
    };
  }

  let firstChargeTime = company.currentPeriodEnd && new Date(company.currentPeriodEnd) > new Date()
    ? new Date(company.currentPeriodEnd)
    : null;
  if (startTrial) {
    const previousEnd = signupTrialEnd || company.nextBillingAt || company.trialEndsAt;
    firstChargeTime = previousEnd && new Date(previousEnd) > new Date()
      ? new Date(previousEnd)
      : new Date(Date.now() + TRIAL_DAYS * DAY);
  }
  const retryingAttempt = samePendingAttempt && !company.subscriptionSessionId;
  const subscriptionId = retryingAttempt
    ? company.subscriptionGatewayId
    : `nx_${company.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)}_${crypto.randomUUID().replace(/-/g, '')}`;
  const idempotencyKey = retryingAttempt ? company.subscriptionRequestKey : crypto.randomUUID();
  if (!retryingAttempt) {
    await tenant.runAsSystem(() => prisma.company.update({
      where: { id: company.id },
      data: {
        subscriptionGatewayId: subscriptionId,
        subscriptionSessionId: null,
        subscriptionRequestKey: idempotencyKey,
        planKey: plan.key,
        subscriptionAmountPaise: plan.pricePaise,
        billingCycle: 'MONTH',
        subscriptionStatus: 'pending_payment',
        authorizationStatus: 'PENDING',
        subscriptionActivatedAt: null,
        ...(startTrial ? {
          trialStartedAt: null,
          trialEndsAt: firstChargeTime,
          nextBillingAt: firstChargeTime,
        } : {}),
      },
    }));
  }
  const returnUrl = process.env.CASHFREE_RETURN_URL
    || `${String(process.env.APP_URL || '').replace(/\/+$/, '')}/settings/billing`;
  const body = {
    subscription_id: subscriptionId,
    customer_details: {
      customer_name: (company.legalName || company.name).slice(0, 100),
      customer_email: customerEmail,
      customer_phone: phone,
    },
    plan_details: {
      plan_name: `NexorCRM ${plan.name}`.slice(0, 40),
      plan_type: 'PERIODIC',
      plan_currency: 'INR',
      plan_amount: monthlyAmount,
      plan_max_amount: monthlyAmount,
      plan_max_cycles: 120,
      plan_intervals: 1,
      plan_interval_type: 'MONTH',
    },
    authorization_details: {
      authorization_amount: 1,
      authorization_amount_refund: true,
    },
    subscription_meta: { return_url: returnUrl },
  };
  if (firstChargeTime) body.subscription_first_charge_time = firstChargeTime.toISOString();
  const sub = await cashfree('/subscriptions', {
    method: 'POST',
    body,
    idempotencyKey,
  });
  if (!sub.subscription_session_id) {
    throw Object.assign(new Error('Cashfree did not return a subscription checkout session.'), { status: 502 });
  }
  await tenant.runAsSystem(() => prisma.company.update({
    where: { id: company.id },
    data: { subscriptionSessionId: sub.subscription_session_id },
  }));
  return {
    subscriptionId,
    subscriptionSessionId: sub.subscription_session_id,
    mode: getCashfreeConfig().mode,
  };
}

/** Create or reuse a direct, one-time Cashfree checkout link for a company. */
async function createEnrollmentPaymentLink(company, plan) {
  if (!cashfreeConfigured()) {
    throw Object.assign(new Error('Cashfree online payments are not configured.'), { status: 503 });
  }
  if (!company || company.subscriptionStatus !== 'pending_payment') {
    throw Object.assign(new Error('A payment link can only be created for a company awaiting payment.'), { status: 409 });
  }
  if (!plan || !plan.active || plan.key !== company.planKey) {
    throw Object.assign(new Error('The company plan is unavailable. Update the plan before creating a payment link.'), { status: 409 });
  }
  const email = String(company.billingEmail || '').trim();
  const phone = String(company.phone || '').replace(/\D/g, '').slice(-10);
  if (!email) throw Object.assign(new Error('Add the customer billing email before creating a payment link.'), { status: 400 });
  if (phone.length !== 10) throw Object.assign(new Error('Add a valid 10-digit customer phone before creating a payment link.'), { status: 400 });

  const now = new Date();
  if (company.enrollmentPaymentLinkId
    && company.enrollmentPaymentLinkUrl
    && company.enrollmentPaymentLinkExpiresAt
    && new Date(company.enrollmentPaymentLinkExpiresAt) > now) {
    return {
      url: company.enrollmentPaymentLinkUrl,
      expiresAt: company.enrollmentPaymentLinkExpiresAt,
      reused: true,
    };
  }

  const linkId = company.enrollmentPaymentLinkId
    && !company.enrollmentPaymentLinkUrl
    ? company.enrollmentPaymentLinkId
    : `nx_${crypto.randomUUID().replace(/-/g, '')}`;
  const expiresAt = new Date(now.getTime() + 7 * DAY);
  const amountPaise = Math.round((company.subscriptionAmountPaise ?? plan.pricePaise) * (1 + GST_PERCENT / 100));
  const amount = amountPaise / 100;
  await tenant.runAsSystem(() => prisma.company.update({
    where: { id: company.id },
    data: {
      enrollmentPaymentLinkId: linkId,
      enrollmentPaymentLinkUrl: null,
      enrollmentPaymentLinkExpiresAt: expiresAt,
    },
  }));

  const { apiUrl } = getCashfreeConfig();
  const baseUrl = String(process.env.APP_URL || '').trim().replace(/\/+$/, '')
    || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:7003');
  if (!baseUrl) {
    throw Object.assign(new Error('Set APP_URL before creating a hosted payment link.'), { status: 503 });
  }
  const returnUrl = `${baseUrl}/payment/success?company=${encodeURIComponent(company.slug || '')}`;
  const notifyUrl = `${baseUrl}/api/webhooks/cashfree`;
  const link = await cashfree('/links', {
    method: 'POST',
    idempotencyKey: linkId,
    apiVersion: process.env.CASHFREE_API_VERSION || '2023-08-01',
    body: {
      link_id: linkId,
      link_amount: amount,
      link_currency: 'INR',
      link_purpose: `${plan.name} plan first payment (includes ${GST_PERCENT}% GST)`.slice(0, 500),
      customer_details: {
        customer_name: String(company.legalName || company.name || 'Customer').slice(0, 100),
        customer_email: email,
        customer_phone: phone,
      },
      link_partial_payments: false,
      link_expiry_time: expiresAt.toISOString(),
      link_notify: { send_email: false, send_sms: false, send_whatsapp: false },
      link_auto_reminders: false,
      link_notes: {
        companyId: company.id,
        purpose: 'platform_enrollment_payment',
      },
      link_meta: {
        return_url: returnUrl,
        notify_url: notifyUrl,
      },
    },
  });
  if (!link.link_id || !link.link_url) {
    throw Object.assign(new Error('Cashfree did not return a hosted payment link URL.'), { status: 502 });
  }
  await tenant.runAsSystem(() => prisma.company.update({
    where: { id: company.id },
    data: { enrollmentPaymentLinkUrl: link.link_url },
  }));
  return { url: link.link_url, expiresAt, reused: false, amountPaise };
}

/** Verify a subscription's current state directly with Cashfree. */
async function verifySubscription(subscriptionId) {
  const sub = await cashfree(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
  return sub;
}

/** Apply Cashfree's signed/provider-verified mandate status without treating authorization as a paid invoice. */
async function syncMandateStatus(company, subscription) {
  const providerStatus = subscriptionStatusOf(subscription);
  const authorizationStatus = authorizationStatusOf(subscription);
  const now = new Date();
  const schedule = subscription?.next_schedule_date
    || subscription?.subscription_details?.next_schedule_date;
  const data = {};
  if (authorizationStatus) data.authorizationStatus = String(authorizationStatus).toUpperCase();
  if (schedule && !Number.isNaN(new Date(schedule).getTime())) data.nextBillingAt = new Date(schedule);

  if (providerStatus === 'ACTIVE') {
    const activatedAt = company.subscriptionActivatedAt || now;
    data.subscriptionActivatedAt = activatedAt;
    if (company.status === 'Active') {
      if (company.subscriptionStatus === 'pending_payment'
        && company.signupRequestKey
        && company.trialEndsAt
        && !company.trialStartedAt) {
        data.subscriptionStatus = company.trialEndsAt > now ? 'trialing' : 'expired';
        data.trialStartedAt = activatedAt;
      }
    }
  } else if (providerStatus && ['CANCELLED', 'CUSTOMER_CANCELLED'].includes(providerStatus)) {
    data.subscriptionStatus = 'cancelled';
    if (!company.currentPeriodEnd && company.subscriptionStatus === 'trialing') {
      data.currentPeriodEnd = company.trialEndsAt;
    }
  } else if (providerStatus && ['EXPIRED', 'COMPLETED', 'LINK_EXPIRED', 'CARD_EXPIRED'].includes(providerStatus)) {
    data.subscriptionStatus = 'expired';
  } else if (providerStatus === 'ON_HOLD') {
    data.subscriptionStatus = company.subscriptionActivatedAt ? 'past_due' : 'pending_payment';
  }

  if (Object.keys(data).length) {
    await tenant.runAsSystem(() => prisma.company.update({ where: { id: company.id }, data }));
  }
  return { providerStatus, authorizationStatus, startedTrial: data.subscriptionStatus === 'trialing' };
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
    if (seen) {
      await tenant.runAsSystem(() => prisma.company.update({
        where: { id: company.id },
        data: {
          subscriptionStatus: 'active',
          currentPeriodEnd: seen.periodEnd,
          nextBillingAt: seen.periodEnd,
        },
      }));
      return seen;
    }
  }
  const end = periodEnd || new Date(new Date(periodStart).getTime() + 30 * DAY);
  const amount = company.subscriptionAmountPaise ?? (plan ? plan.pricePaise : 0);
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
    data: {
      subscriptionStatus: 'active',
      currentPeriodEnd: end,
      nextBillingAt: end,
      planKey: plan?.key || company.planKey,
    },
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
  cashfreeConfigured, cashfree, accessFor, subscriptionIsAuthorized, authorizationStatusOf, subscriptionStatusOf,
  syncMandateStatus, planFor, seatsUsed, assertSeatAvailable, trialEndOf,
  createSubscription, createEnrollmentPaymentLink, verifySubscription,
  verifyWebhookSignature: (rawBody, signature, timestamp) => verifyWebhookSignature(
    rawBody, signature, timestamp, process.env.CASHFREE_SECRET_KEY,
  ),
  recordPayment,
  sweepSubscription,
};
