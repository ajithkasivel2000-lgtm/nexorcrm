process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unused@localhost:1/unused';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const billing = require('../../utils/billing');
const prisma = require('../../prismaClient');
const billingController = require('../../controllers/billingController');
const { getCashfreeConfig } = require('../../utils/cashfreeConfig');

test('Cashfree environment selects its matching API URL and rejects the opposite gateway', () => {
  const previous = {
    environment: process.env.CASHFREE_ENVIRONMENT,
    apiUrl: process.env.CASHFREE_API_URL,
    nodeEnv: process.env.NODE_ENV,
  };
  process.env.NODE_ENV = 'test';
  try {
    process.env.CASHFREE_ENVIRONMENT = 'PRODUCTION';
    delete process.env.CASHFREE_API_URL;
    assert.deepEqual(getCashfreeConfig(), {
      environment: 'PRODUCTION',
      apiUrl: 'https://api.cashfree.com/pg',
      mode: 'production',
    });

    process.env.CASHFREE_ENVIRONMENT = 'SANDBOX';
    process.env.CASHFREE_API_URL = 'https://api.cashfree.com/pg';
    assert.throws(getCashfreeConfig, {
      status: 503,
      code: 'CASHFREE_ENVIRONMENT_MISMATCH',
      message: 'Cashfree SANDBOX must use https://sandbox.cashfree.com/pg.',
    });
  } finally {
    for (const [key, value] of [
      ['CASHFREE_ENVIRONMENT', previous.environment],
      ['CASHFREE_API_URL', previous.apiUrl],
      ['NODE_ENV', previous.nodeEnv],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('Cashfree subscription requires a 10-digit billing phone before contacting the gateway', async () => {
  await assert.rejects(
    billing.createSubscription({ phone: '12345' }, {}, 'billing@example.test'),
    {
      status: 400,
      message: 'Add a 10-digit billing phone number before starting a Cashfree subscription.',
    },
  );
});

test('Cashfree mandate activates only after the provider subscription status is ACTIVE', () => {
  assert.equal(billing.subscriptionIsAuthorized({ subscription_status: 'ACTIVE' }), true);
  assert.equal(billing.subscriptionIsAuthorized({
    subscription_status: 'BANK_APPROVAL_PENDING',
    authorization_details: { authorization_status: 'SUCCESS' },
  }), false);
  assert.equal(billing.subscriptionIsAuthorized({
    subscription_details: { subscription_status: 'ACTIVE' },
  }), true);
  assert.equal(billing.subscriptionIsAuthorized({
    subscription_status: 'PENDING',
    authorization_details: { authorization_status: 'PENDING' },
  }), false);
});

test('pending Cashfree authorization does not grant CRM access', () => {
  const access = billing.accessFor({ subscriptionStatus: 'pending_payment' });
  assert.equal(access.allowed, false);
  assert.equal(access.state, 'pending_payment');
});

test('an active mandate without a successful charge does not grant paid access', async () => {
  const previousUpdate = prisma.company.update;
  let update;
  prisma.company.update = async (args) => { update = args.data; return args; };
  try {
    const activatedAt = new Date('2026-01-01T00:00:00.000Z');
    await billing.syncMandateStatus({
      id: 'company-1',
      status: 'Active',
      signupRequestKey: 'signup-key',
      trialEndsAt: new Date('2026-01-15T00:00:00.000Z'),
      trialStartedAt: activatedAt,
      subscriptionActivatedAt: null,
      subscriptionStatus: 'pending_payment',
    }, { subscription_status: 'ACTIVE' });

    assert.equal(update.subscriptionStatus, undefined);
    assert.equal(billing.accessFor({
      subscriptionStatus: update.subscriptionStatus || 'pending_payment',
    }).allowed, false);
    assert.ok(update.subscriptionActivatedAt);
    assert.equal(Object.hasOwn(update, 'trialEndsAt'), false);
  } finally {
    prisma.company.update = previousUpdate;
  }
});

test('Cashfree mandate activation starts a signup trial at its scheduled end date', async () => {
  const previousUpdate = prisma.company.update;
  let update;
  prisma.company.update = async (args) => { update = args.data; return args; };
  try {
    await billing.syncMandateStatus({
      id: 'signup-company',
      status: 'Active',
      signupRequestKey: 'signup-key',
      trialEndsAt: new Date(Date.now() + 86400000),
      trialStartedAt: null,
      subscriptionActivatedAt: null,
      subscriptionStatus: 'pending_payment',
    }, { subscription_status: 'ACTIVE' });

    assert.equal(update.subscriptionStatus, 'trialing');
    assert.ok(update.trialStartedAt);
  } finally {
    prisma.company.update = previousUpdate;
  }
});

test('a Cashfree mandate activation does not replace a paid one-time enrollment period', async () => {
  const previousUpdate = prisma.company.update;
  let update;
  prisma.company.update = async (args) => { update = args.data; return args; };
  try {
    await billing.syncMandateStatus({
      id: 'paid-company',
      status: 'Active',
      signupRequestKey: 'signup-key',
      trialEndsAt: new Date(Date.now() + 86400000),
      trialStartedAt: null,
      subscriptionActivatedAt: null,
      subscriptionStatus: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    }, { subscription_status: 'ACTIVE' });

    assert.equal(update.subscriptionStatus, undefined);
  } finally {
    prisma.company.update = previousUpdate;
  }
});

test('Cashfree ON_HOLD before mandate activation does not grant grace-period access', async () => {
  const previousUpdate = prisma.company.update;
  let update;
  prisma.company.update = async (args) => { update = args.data; return args; };
  try {
    await billing.syncMandateStatus({
      id: 'company-pending',
      status: 'Active',
      subscriptionStatus: 'pending_payment',
      subscriptionActivatedAt: null,
    }, {
      subscription_status: 'ON_HOLD',
      authorization_details: { authorization_status: 'FAILURE' },
    });

    assert.equal(update.subscriptionStatus, 'pending_payment');
    assert.equal(update.authorizationStatus, 'FAILURE');
    assert.equal(billing.accessFor({ subscriptionStatus: update.subscriptionStatus }).allowed, false);
  } finally {
    prisma.company.update = previousUpdate;
  }
});

test('Cashfree API errors include the failed endpoint, provider code and request id', async () => {
  const previous = {
    appId: process.env.CASHFREE_APP_ID,
    secret: process.env.CASHFREE_SECRET_KEY,
    fetch: global.fetch,
    consoleError: console.error,
  };
  const logs = [];
  process.env.CASHFREE_APP_ID = 'test-app';
  process.env.CASHFREE_SECRET_KEY = 'test-secret';
  console.error = (...args) => logs.push(args.join(' '));
  global.fetch = async () => ({
    ok: false,
    status: 400,
    headers: new Headers({ 'x-request-id': 'cashfree-test-request' }),
    json: async () => ({ code: 'INVALID_PLAN', message: 'Plan details are invalid.' }),
  });

  try {
    await assert.rejects(
      billing.cashfree('/plans', { method: 'POST', body: {} }),
      {
        status: 502,
        message: 'Cashfree POST /plans (400 INVALID_PLAN): Plan details are invalid. (request cashfree-test-request)',
      },
    );
    assert.match(logs[0], /"endpoint":"\/plans"/);
    assert.match(logs[0], /"method":"POST"/);
    assert.match(logs[0], /"httpStatus":400/);
    assert.match(logs[0], /"errorCode":"INVALID_PLAN"/);
    assert.match(logs[0], /"requestId":"cashfree-test-request"/);
    assert.doesNotMatch(logs.join('\n'), /test-secret|test-app/);
  } finally {
    global.fetch = previous.fetch;
    console.error = previous.consoleError;
    if (previous.appId === undefined) delete process.env.CASHFREE_APP_ID;
    else process.env.CASHFREE_APP_ID = previous.appId;
    if (previous.secret === undefined) delete process.env.CASHFREE_SECRET_KEY;
    else process.env.CASHFREE_SECRET_KEY = previous.secret;
  }
});

test('Cashfree inactive profile returns a safe activation message and logs provider diagnostics', async () => {
  const previous = {
    appId: process.env.CASHFREE_APP_ID,
    secret: process.env.CASHFREE_SECRET_KEY,
    fetch: global.fetch,
    consoleError: console.error,
  };
  const logs = [];
  process.env.CASHFREE_APP_ID = 'test-app';
  process.env.CASHFREE_SECRET_KEY = 'test-secret';
  console.error = (...args) => logs.push(args.join(' '));
  global.fetch = async () => ({
    ok: false,
    status: 400,
    headers: new Headers({ 'x-request-id': 'cashfree-inactive-request' }),
    json: async () => ({ code: 'profile_inactive', message: 'Profile is inactive.' }),
  });

  try {
    await assert.rejects(
      billing.cashfree('/plans', { method: 'POST', body: {} }),
      {
        status: 503,
        code: 'CASHFREE_PROFILE_INACTIVE',
        message: 'Cashfree merchant profile is inactive or subscription service is not enabled.',
      },
    );
    assert.match(logs[0], /"endpoint":"\/plans"/);
    assert.match(logs[0], /"method":"POST"/);
    assert.match(logs[0], /"httpStatus":400/);
    assert.match(logs[0], /"errorCode":"profile_inactive"/);
    assert.match(logs[0], /"requestId":"cashfree-inactive-request"/);
    assert.doesNotMatch(logs.join('\n'), /test-secret|test-app/);
  } finally {
    global.fetch = previous.fetch;
    console.error = previous.consoleError;
    if (previous.appId === undefined) delete process.env.CASHFREE_APP_ID;
    else process.env.CASHFREE_APP_ID = previous.appId;
    if (previous.secret === undefined) delete process.env.CASHFREE_SECRET_KEY;
    else process.env.CASHFREE_SECRET_KEY = previous.secret;
  }
});

test('subscription calls use the subscription API version separately from PG links', async () => {
  const previous = {
    appId: process.env.CASHFREE_APP_ID,
    secret: process.env.CASHFREE_SECRET_KEY,
    paymentVersion: process.env.CASHFREE_API_VERSION,
    subscriptionVersion: process.env.CASHFREE_SUBSCRIPTION_API_VERSION,
    environment: process.env.CASHFREE_ENVIRONMENT,
    apiUrl: process.env.CASHFREE_API_URL,
    fetch: global.fetch,
  };
  let apiVersion;
  let requestUrl;
  let requestHeaders;
  process.env.CASHFREE_APP_ID = 'test-app';
  process.env.CASHFREE_SECRET_KEY = 'test-secret';
  process.env.CASHFREE_API_VERSION = '2023-08-01';
  process.env.CASHFREE_SUBSCRIPTION_API_VERSION = '2025-01-01';
  process.env.CASHFREE_ENVIRONMENT = 'PRODUCTION';
  process.env.CASHFREE_API_URL = 'https://api.cashfree.com/pg';
  global.fetch = async (url, options) => {
    requestUrl = url;
    apiVersion = options.headers['x-api-version'];
    requestHeaders = options.headers;
    return { ok: true, json: async () => ({}) };
  };

  try {
    await billing.cashfree('/subscriptions');
    assert.equal(requestUrl, 'https://api.cashfree.com/pg/subscriptions');
    assert.equal(apiVersion, '2025-01-01');
    assert.equal(requestHeaders['x-client-id'], 'test-app');
    assert.equal(requestHeaders['x-client-secret'], 'test-secret');
  } finally {
    global.fetch = previous.fetch;
    for (const [key, value] of [
      ['CASHFREE_APP_ID', previous.appId],
      ['CASHFREE_SECRET_KEY', previous.secret],
      ['CASHFREE_API_VERSION', previous.paymentVersion],
      ['CASHFREE_SUBSCRIPTION_API_VERSION', previous.subscriptionVersion],
      ['CASHFREE_ENVIRONMENT', previous.environment],
      ['CASHFREE_API_URL', previous.apiUrl],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('subscription sends its monthly plan inline and returns a Cashfree subscription session', async () => {
  const previous = {
    appId: process.env.CASHFREE_APP_ID,
    secret: process.env.CASHFREE_SECRET_KEY,
    environment: process.env.CASHFREE_ENVIRONMENT,
    apiUrl: process.env.CASHFREE_API_URL,
    returnUrl: process.env.CASHFREE_RETURN_URL,
    fetch: global.fetch,
    companyUpdate: prisma.company.update,
  };
  const calls = [];
  const scheduledFirstCharge = new Date(Date.now() + 14 * 86400000);
  process.env.CASHFREE_APP_ID = 'test-app';
  process.env.CASHFREE_SECRET_KEY = 'test-secret';
  process.env.CASHFREE_ENVIRONMENT = 'SANDBOX';
  process.env.CASHFREE_API_URL = 'https://sandbox.cashfree.com/pg';
  process.env.CASHFREE_RETURN_URL = 'http://localhost:7003/payment/success';
  prisma.company.update = async ({ data }) => data;
  global.fetch = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ url, body, options });
    return {
      ok: true,
      json: async () => ({ subscription_session_id: 'cashfree-sub-session' }),
    };
  };

  try {
    const result = await billing.createSubscription(
      {
        id: 'company-1',
        name: 'Test company',
        phone: '1234567890',
        signupRequestKey: 'signup-key',
        trialEndsAt: scheduledFirstCharge,
      },
      {
        id: 'plan-1',
        key: 'growth',
        name: 'Growth',
        pricePaise: 10000,
        gatewayPlanId: 'stale-cashfree-plan-id',
      },
      'billing@example.test',
      { startTrial: true },
    );

    const subscriptionCalls = calls.filter(({ url }) => url.endsWith('/subscriptions'));
    assert.equal(result.subscriptionSessionId, 'cashfree-sub-session');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://sandbox.cashfree.com/pg/subscriptions');
    assert.equal(subscriptionCalls.length, 1);
    assert.match(subscriptionCalls[0].body.subscription_first_charge_time, /^\d{4}-\d\d-\d\dT/);
    assert.equal(subscriptionCalls[0].body.subscription_first_charge_time, scheduledFirstCharge.toISOString());
    assert.match(calls[0].options?.headers?.['x-idempotency-key'] || '', /^[0-9a-f-]{36}$/i);
    assert.deepEqual(subscriptionCalls[0].body.plan_details, {
      plan_name: 'NexorCRM Growth',
      plan_type: 'PERIODIC',
      plan_currency: 'INR',
      plan_amount: 118,
      plan_max_amount: 118,
      plan_max_cycles: 120,
      plan_intervals: 1,
      plan_interval_type: 'MONTH',
    });
    assert.equal(subscriptionCalls[0].body.subscription_id, result.subscriptionId);
    assert.equal(subscriptionCalls[0].body.subscription_meta.return_url, 'http://localhost:7003/payment/success');
    assert.ok(!Object.hasOwn(subscriptionCalls[0].body.plan_details, 'plan_id'));

    const paidPeriodEnd = new Date(Date.now() + 30 * 86400000);
    await billing.createSubscription({
      id: 'company-paid',
      name: 'Paid company',
      phone: '1234567890',
      currentPeriodEnd: paidPeriodEnd,
    }, {
      key: 'growth',
      name: 'Growth',
      pricePaise: 10000,
    }, 'billing@example.test');
    assert.equal(calls[1].body.subscription_first_charge_time, paidPeriodEnd.toISOString());
  } finally {
    global.fetch = previous.fetch;
    prisma.company.update = previous.companyUpdate;
    for (const [key, value] of [
      ['CASHFREE_APP_ID', previous.appId],
      ['CASHFREE_SECRET_KEY', previous.secret],
      ['CASHFREE_ENVIRONMENT', previous.environment],
      ['CASHFREE_API_URL', previous.apiUrl],
      ['CASHFREE_RETURN_URL', previous.returnUrl],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('signup payment-link creation returns a direct Cashfree hosted URL for plan price plus GST', async () => {
      const previous = {
        appId: process.env.CASHFREE_APP_ID,
        secret: process.env.CASHFREE_SECRET_KEY,
        environment: process.env.CASHFREE_ENVIRONMENT,
        apiUrl: process.env.CASHFREE_API_URL,
        apiVersion: process.env.CASHFREE_API_VERSION,
        appUrl: process.env.APP_URL,
        fetch: global.fetch,
        companyUpdate: prisma.company.update,
      };
      const calls = [];
      const updates = [];
      process.env.CASHFREE_APP_ID = 'test-app';
      process.env.CASHFREE_SECRET_KEY = 'test-secret';
      process.env.CASHFREE_ENVIRONMENT = 'SANDBOX';
      process.env.CASHFREE_API_URL = 'https://sandbox.cashfree.com/pg';
      process.env.CASHFREE_API_VERSION = '2023-08-01';
      process.env.APP_URL = 'https://nexorcrm.example.test';
      prisma.company.update = async ({ data }) => { updates.push(data); return data; };
      global.fetch = async (url, options) => {
        calls.push({ url, options, body: JSON.parse(options.body) });
        return { ok: true, json: async () => ({ link_id: calls[0].body.link_id, link_url: 'https://payments.cashfree.test/link/123' }) };
      };

      try {
        const result = await billing.createEnrollmentPaymentLink({
          id: 'company-1',
          name: 'Example Company',
          slug: 'example',
          billingEmail: 'billing@example.test',
          phone: '+91 9876543210',
          planKey: 'starter',
          subscriptionStatus: 'pending_payment',
          subscriptionAmountPaise: 99900,
          enrollmentPaymentLinkId: null,
          enrollmentPaymentLinkUrl: null,
          enrollmentPaymentLinkExpiresAt: null,
        }, { key: 'starter', name: 'Starter', active: true, pricePaise: 99900 });

        assert.equal(result.url, 'https://payments.cashfree.test/link/123');
        assert.equal(result.amountPaise, 117882);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, 'https://sandbox.cashfree.com/pg/links');
        assert.equal(calls[0].options.headers['x-api-version'], '2023-08-01');
        assert.equal(calls[0].options.headers['x-client-secret'], 'test-secret');
        assert.equal(calls[0].options.headers['x-idempotency-key'], calls[0].body.link_id);
        assert.equal(calls[0].body.link_amount, 1178.82);
        assert.equal(calls[0].body.link_partial_payments, false);
        assert.equal(calls[0].body.link_notify.send_whatsapp, false);
        assert.equal(calls[0].body.link_meta.return_url, 'https://nexorcrm.example.test/payment/success?company=example');
        assert.equal(calls[0].body.link_meta.notify_url, 'https://nexorcrm.example.test/api/webhooks/cashfree');
        assert.equal(updates[0].enrollmentPaymentLinkId, calls[0].body.link_id);
        assert.equal(updates[1].enrollmentPaymentLinkUrl, result.url);
      } finally {
        global.fetch = previous.fetch;
        prisma.company.update = previous.companyUpdate;
        for (const [key, value] of [
          ['CASHFREE_APP_ID', previous.appId],
          ['CASHFREE_SECRET_KEY', previous.secret],
          ['CASHFREE_ENVIRONMENT', previous.environment],
          ['CASHFREE_API_URL', previous.apiUrl],
          ['CASHFREE_API_VERSION', previous.apiVersion],
          ['APP_URL', previous.appUrl],
        ]) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    });

test('paid Cashfree enrollment-link webhook records a paid period idempotently', async () => {
      const previous = {
        appId: process.env.CASHFREE_APP_ID,
        secret: process.env.CASHFREE_SECRET_KEY,
        findUnique: prisma.company.findUnique,
        companyUpdate: prisma.company.update,
        planFor: billing.planFor,
        recordPayment: billing.recordPayment,
      };
      const company = {
        id: 'company-1',
        planKey: 'starter',
        subscriptionAmountPaise: 100000,
        enrollmentPaymentLinkId: 'nx_enrollment_test',
      };
      let recorded;
      let companyUpdate;
      process.env.CASHFREE_APP_ID = 'test-app';
      process.env.CASHFREE_SECRET_KEY = 'webhook-test-secret';
      prisma.company.findUnique = async ({ where }) => (
        where.enrollmentPaymentLinkId === company.enrollmentPaymentLinkId ? company : null
      );
      prisma.company.update = async ({ data }) => { companyUpdate = data; return data; };
      billing.planFor = async () => ({ key: 'starter', name: 'Starter' });
      billing.recordPayment = async (receivedCompany, plan, payment) => { recorded = { receivedCompany, plan, payment }; };

      try {
        const raw = JSON.stringify({
          type: 'PAYMENT_LINK_EVENT',
          data: {
            link_id: company.enrollmentPaymentLinkId,
            link_status: 'PAID',
            link_amount: 1180,
            payment: {
              cf_payment_id: 'cf_payment_123',
              payment_amount: 1180,
              payment_time: '2026-10-05T10:00:00.000Z',
            },
          },
        });
        const timestamp = '1791198880';
        const signature = crypto.createHmac('sha256', process.env.CASHFREE_SECRET_KEY)
          .update(`${timestamp}${raw}`)
          .digest('base64');
        const response = await billingController.webhook({
          rawBody: Buffer.from(raw),
          headers: { 'x-webhook-signature': signature, 'x-webhook-timestamp': timestamp },
          body: JSON.parse(raw),
        }, { sendStatus: (status) => status });

        assert.equal(response, 200);
        assert.equal(recorded.receivedCompany, company);
        assert.equal(recorded.plan.key, 'starter');
        assert.equal(recorded.payment.paymentId, 'cf_payment_123');
        assert.equal(recorded.payment.periodStart.toISOString(), '2026-10-05T10:00:00.000Z');
        assert.equal(recorded.payment.periodEnd.getTime() - recorded.payment.periodStart.getTime(), 30 * 86400000);
        assert.deepEqual(companyUpdate, {
          subscriptionGatewayId: null,
          subscriptionSessionId: null,
          subscriptionRequestKey: null,
          authorizationStatus: null,
        });
      } finally {
        prisma.company.findUnique = previous.findUnique;
        prisma.company.update = previous.companyUpdate;
        billing.planFor = previous.planFor;
        billing.recordPayment = previous.recordPayment;
        if (previous.appId === undefined) delete process.env.CASHFREE_APP_ID;
        else process.env.CASHFREE_APP_ID = previous.appId;
        if (previous.secret === undefined) delete process.env.CASHFREE_SECRET_KEY;
        else process.env.CASHFREE_SECRET_KEY = previous.secret;
      }
});
