const prisma = require('../prismaClient');
const tenant = require('../utils/tenant');
const { sendError } = require('../utils/apiError');
const billing = require('../utils/billing');

/**
 * Billing.
 *
 * For a company's administrators (/api/billing):
 *   GET  /                     plan, status, trial, seats, plans on offer, invoices
 *   PUT  /details              legal name, GSTIN, address for invoices
 *   POST /subscribe            { planKey } → Cashfree subscription checkout
 *   POST /verify               Checkout's return → check the subscription with Cashfree
 *   POST /cancel               stop renewing at the end of the paid period
 *
 * For the platform administrator (/api/platform):
 *   GET/POST/PUT /plans
 *   POST /companies/:id/billing  { action: 'activate'|'extend-trial'|'set-plan'|'expire', planKey?, days? }
 *
 * Cashfree → POST /api/webhooks/cashfree (signature-checked)
 */

const companyOf = (req) => tenant.runAsSystem(() => prisma.company.findUnique({ where: { id: req.companyId } }));

const publicPlan = (p) => ({
  key: p.key, name: p.name, pricePaise: p.pricePaise, maxUsers: p.maxUsers,
  description: p.description, features: p.features, gstPercent: billing.GST_PERCENT,
});

exports.overview = async (req, res) => {
  try {
    const company = await companyOf(req);
    const [plans, invoices, seats] = await Promise.all([
      tenant.runAsSystem(() => prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })),
      prisma.invoice.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      billing.seatsUsed(),
    ]);
    const plan = plans.find((p) => p.key === company.planKey) || null;
    const limitPlan = plan || plans.find((p) => p.key === 'growth') || null;
    res.status(200).json({
      company: {
        id: company.id, name: company.name, legalName: company.legalName, gstin: company.gstin,
        billingAddress: company.billingAddress, billingEmail: company.billingEmail, phone: company.phone,
      },
      status: company.subscriptionStatus,
      access: req.subscription || billing.accessFor(company),
      trialEndsAt: company.subscriptionStatus === 'trialing' ? billing.trialEndOf(company) : null,
      currentPeriodEnd: company.currentPeriodEnd,
      plan: plan ? publicPlan(plan) : null,
      seats: { used: seats, limit: company.subscriptionStatus === 'internal' ? 0 : (limitPlan?.maxUsers || 0) },
      plans: plans.map(publicPlan),
      invoices,
      onlinePayments: billing.cashfreeConfigured(),
      isPlatformAdmin: require('./platformController').isPlatformAdmin(req.user),
    });
  } catch (error) {
    sendError(res, error, 'Could not load billing', 500);
  }
};

exports.updateDetails = async (req, res) => {
  try {
    const data = {};
    for (const k of ['legalName', 'gstin', 'billingAddress', 'billingEmail', 'phone']) {
      if (req.body?.[k] !== undefined) data[k] = String(req.body[k] || '').trim() || null;
    }
    if (data.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(data.gstin.toUpperCase())) {
      return res.status(400).json({ message: 'That GSTIN does not look right (15 characters, e.g. 29ABCDE1234F1Z5).' });
    }
    if (data.gstin) data.gstin = data.gstin.toUpperCase();
    const company = await tenant.runAsSystem(() => prisma.company.update({ where: { id: req.companyId }, data }));
    res.status(200).json({ message: 'Billing details saved.', company: { legalName: company.legalName, gstin: company.gstin } });
  } catch (error) {
    sendError(res, error, 'Could not save billing details', 400);
  }
};

exports.subscribe = async (req, res) => {
  try {
    const company = await companyOf(req);
    if (company.subscriptionStatus === 'internal') return res.status(400).json({ message: 'This company is not billed.' });
    const plan = await tenant.runAsSystem(() => prisma.plan.findUnique({ where: { key: String(req.body?.planKey || '') } }));
    if (!plan || !plan.active) return res.status(400).json({ message: 'Choose one of the plans on offer.' });
    // Downgrading below current usage would lock people out on the next check.
    if (plan.maxUsers && await billing.seatsUsed() > plan.maxUsers) {
      return res.status(400).json({ message: `You have more active users than the ${plan.name} plan allows (${plan.maxUsers}). Archive some users first, or pick a bigger plan.` });
    }
    const checkout = await billing.createSubscription(company, plan, company.billingEmail || req.user.email);
    res.status(200).json(checkout);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    sendError(res, error, 'Could not start the subscription', 500);
  }
};

exports.verify = async (req, res) => {
  try {
    const { subscriptionId } = req.body || {};
    const company = await companyOf(req);
    if (!subscriptionId || subscriptionId !== company.subscriptionGatewayId) {
      return res.status(400).json({ message: 'That payment is not for this company.' });
    }
    const subscription = await billing.verifySubscription(subscriptionId);
    if (subscription.subscription_status !== 'ACTIVE') {
      return res.status(200).json({
        pending: true,
        message: 'Cashfree is still confirming your subscription. Refresh billing in a moment.',
        status: subscription.subscription_status,
      });
    }
    await tenant.runAsSystem(() => prisma.company.update({
      where: { id: company.id },
      data: { subscriptionStatus: 'active' },
    }));
    res.status(200).json({ message: 'Cashfree has activated your subscription. Thank you.' });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    sendError(res, error, 'Could not confirm the payment', 500);
  }
};

exports.cancel = async (req, res) => {
  try {
    const company = await companyOf(req);
    if (company.subscriptionGatewayId && billing.cashfreeConfigured()) {
      await billing.cashfree(`/subscriptions/${encodeURIComponent(company.subscriptionGatewayId)}/manage`, {
        method: 'POST',
        body: { action: 'CANCEL' },
      });
    }
    await tenant.runAsSystem(() => prisma.company.update({ where: { id: company.id }, data: { subscriptionStatus: 'cancelled' } }));
    res.status(200).json({ message: company.currentPeriodEnd
      ? `Cancelled. You keep access until ${new Date(company.currentPeriodEnd).toDateString()}.`
      : 'Cancelled.' });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    sendError(res, error, 'Could not cancel', 500);
  }
};

/* ---- Cashfree webhook ---------------------------------------------------- */

/* ACK only after processing succeeds so Cashfree retries transient failures. */
exports.webhook = (req, res) => tenant.runAsSystem(async () => {
  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];
  if (!billing.verifyWebhookSignature(req.rawBody, signature, timestamp)) return res.sendStatus(400);
  try {
    const type = req.body?.type;
    const data = req.body?.data || {};
    const sub = data.subscription_details || {};
    const subscriptionId = data.subscription_id || sub.subscription_id;
    if (!subscriptionId) return res.sendStatus(200);
    const company = await prisma.company.findUnique({ where: { subscriptionGatewayId: subscriptionId } });
    if (!company) return res.sendStatus(200);
    const plan = await billing.planFor(company);
    const status = sub.subscription_status || data.subscription_status;
    const paymentId = data.cf_payment_id || data.payment_id || null;
    if (type === 'SUBSCRIPTION_PAYMENT_SUCCESS' && paymentId) {
      const paymentTime = data.payment_initiated_date ? new Date(data.payment_initiated_date) : new Date();
      await billing.recordPayment(company, plan, { paymentId, periodStart: paymentTime });
    } else if (type === 'SUBSCRIPTION_PAYMENT_FAILED' || status === 'ON_HOLD') {
      await prisma.company.update({ where: { id: company.id }, data: { subscriptionStatus: 'past_due' } });
    } else if (type === 'SUBSCRIPTION_STATUS_CHANGED' || type === 'SUBSCRIPTION_AUTH_STATUS') {
      if (status === 'ACTIVE') {
        await prisma.company.update({ where: { id: company.id }, data: { subscriptionStatus: 'active' } });
      } else if (['CANCELLED', 'CUSTOMER_CANCELLED', 'COMPLETED', 'EXPIRED'].includes(status)) {
        await prisma.company.update({ where: { id: company.id }, data: { subscriptionStatus: 'cancelled' } });
      }
    }
    return res.sendStatus(200);
  } catch (error) {
    console.error('Cashfree subscription webhook failed:', error.message);
    return res.sendStatus(500);
  }
});

/* ---- platform: plans and manual billing ----------------------------------- */

exports.listPlans = (req, res) => tenant.runAsSystem(async () => {
  res.status(200).json(await prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } }));
});

function planData(body) {
  const data = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.key !== undefined) data.key = String(body.key).trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (body.priceRupees !== undefined) {
    const rupees = Number(body.priceRupees);
    if (!(rupees >= 0)) throw Object.assign(new Error('Price must be a number of rupees.'), { status: 400 });
    data.pricePaise = Math.round(rupees * 100);
  }
  if (body.maxUsers !== undefined) data.maxUsers = Math.max(0, parseInt(body.maxUsers, 10) || 0);
  if (body.description !== undefined) data.description = body.description || null;
  if (body.features !== undefined) data.features = (Array.isArray(body.features) ? body.features : String(body.features).split('\n')).map((s) => String(s).trim()).filter(Boolean);
  if (body.active !== undefined) data.active = Boolean(body.active);
  if (body.sortOrder !== undefined) data.sortOrder = parseInt(body.sortOrder, 10) || 0;
  return data;
}

exports.createPlan = (req, res) => tenant.runAsSystem(async () => {
  try {
    const data = planData(req.body || {});
    if (!data.key || !data.name || data.pricePaise === undefined) return res.status(400).json({ message: 'Key, name and price are required.' });
    res.status(201).json(await prisma.plan.create({ data }));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (error.code === 'P2002') return res.status(409).json({ message: 'A plan with that key already exists.' });
    sendError(res, error, 'Could not create the plan', 400);
  }
});

exports.updatePlan = (req, res) => tenant.runAsSystem(async () => {
  try {
    const data = planData(req.body || {});
    delete data.key; // companies reference plans by key
    // A price change needs a new Cashfree plan; existing subscribers keep theirs.
    if (data.pricePaise !== undefined) data.gatewayPlanId = null;
    res.status(200).json(await prisma.plan.update({ where: { id: req.params.id }, data }));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (error.code === 'P2025') return res.status(404).json({ message: 'Plan not found' });
    sendError(res, error, 'Could not update the plan', 400);
  }
});

exports.companyBilling = (req, res) => tenant.runAsSystem(async () => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!company) return res.status(404).json({ message: 'Company not found' });
    const { action, planKey, days } = req.body || {};
    const plan = planKey ? await prisma.plan.findUnique({ where: { key: planKey } }) : await billing.planFor(company);
    if (planKey && !plan) return res.status(400).json({ message: 'Unknown plan.' });

    if (action === 'activate') {
      // A payment received outside Cashfree (bank transfer): record it and activate.
      // An amount needs a plan to price it against — activating without one
      // recorded a ₹0 invoice and made the company 'active' for nothing.
      if (!plan) return res.status(400).json({ message: 'Choose a plan to activate against (the invoice needs a price).' });
      const period = Math.max(1, parseInt(days, 10) || 30);
      const start = company.currentPeriodEnd && company.currentPeriodEnd > new Date() ? company.currentPeriodEnd : new Date();
      const invoice = await billing.recordPayment(company, plan, {
        periodStart: start,
        periodEnd: new Date(new Date(start).getTime() + period * 86400000),
        description: `${plan ? plan.name : 'Subscription'} — paid offline (${period} days)`,
      });
      return res.status(200).json({ message: `Active until ${invoice.periodEnd.toDateString()}.`, invoice });
    }
    if (action === 'extend-trial') {
      const extra = Math.max(1, parseInt(days, 10) || 7);
      const from = billing.trialEndOf(company) > new Date() ? billing.trialEndOf(company) : new Date();
      const updated = await prisma.company.update({
        where: { id: company.id },
        data: { subscriptionStatus: 'trialing', trialEndsAt: new Date(from.getTime() + extra * 86400000) },
      });
      return res.status(200).json({ message: `Trial extended to ${updated.trialEndsAt.toDateString()}.` });
    }
    if (action === 'set-plan') {
      if (!plan) return res.status(400).json({ message: 'Choose a plan.' });
      await prisma.company.update({ where: { id: company.id }, data: { planKey: plan.key } });
      return res.status(200).json({ message: `Plan set to ${plan.name}.` });
    }
    if (action === 'internal') {
      await prisma.company.update({ where: { id: company.id }, data: { subscriptionStatus: 'internal' } });
      return res.status(200).json({ message: 'Marked as internal (never billed).' });
    }
    if (action === 'expire') {
      await prisma.company.update({ where: { id: company.id }, data: { subscriptionStatus: 'expired' } });
      return res.status(200).json({ message: 'Subscription expired; only billing opens for them now.' });
    }
    return res.status(400).json({ message: 'Unknown action.' });
  } catch (error) {
    sendError(res, error, 'Could not update billing', 400);
  }
});
