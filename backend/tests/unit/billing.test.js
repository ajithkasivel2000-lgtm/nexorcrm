process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unused@localhost:1/unused';

const test = require('node:test');
const assert = require('node:assert/strict');
const billing = require('../../utils/billing');
const prisma = require('../../prismaClient');
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

test('subscription refreshes a stale cross-environment plan once when Cashfree reports plan_not_found', async () => {
  const previous = {
    appId: process.env.CASHFREE_APP_ID,
    secret: process.env.CASHFREE_SECRET_KEY,
    environment: process.env.CASHFREE_ENVIRONMENT,
    apiUrl: process.env.CASHFREE_API_URL,
    fetch: global.fetch,
    planUpdate: prisma.plan.update,
    companyUpdate: prisma.company.update,
    consoleError: console.error,
  };
  const calls = [];
  const savedPlanIds = [];
  let planCreationCount = 0;
  let subscriptionCount = 0;
  process.env.CASHFREE_APP_ID = 'test-app';
  process.env.CASHFREE_SECRET_KEY = 'test-secret';
  process.env.CASHFREE_ENVIRONMENT = 'PRODUCTION';
  process.env.CASHFREE_API_URL = 'https://api.cashfree.com/pg';
  console.error = () => {};
  prisma.plan.update = async ({ data }) => {
    savedPlanIds.push(data.gatewayPlanId);
    return data;
  };
  prisma.company.update = async ({ data }) => data;
  global.fetch = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ url, body });
    if (url.endsWith('/plans')) {
      planCreationCount += 1;
      return {
        ok: true,
        json: async () => ({ plan_id: `cashfree-plan-${planCreationCount}` }),
      };
    }
    subscriptionCount += 1;
    if (subscriptionCount === 1) {
      return {
        ok: false,
        status: 400,
        headers: new Headers({ 'x-request-id': 'plan-not-found-request' }),
        json: async () => ({ code: 'plan_not_found', message: 'Plan does not exist.' }),
      };
    }
    return {
      ok: true,
      json: async () => ({ subscription_session_id: 'cashfree-sub-session' }),
    };
  };

  try {
    const result = await billing.createSubscription(
      { id: 'company-1', name: 'Test company', phone: '1234567890' },
      {
        id: 'plan-1',
        key: 'growth',
        name: 'Growth',
        pricePaise: 10000,
        gatewayPlanId: 'nx_sbx_growth_old-plan',
      },
      'billing@example.test',
    );

    const planCalls = calls.filter(({ url }) => url.endsWith('/plans'));
    const subscriptionCalls = calls.filter(({ url }) => url.endsWith('/subscriptions'));
    assert.equal(result.subscriptionSessionId, 'cashfree-sub-session');
    assert.equal(planCalls.length, 2);
    assert.ok(planCalls.every(({ body }) => body.plan_id.startsWith('nx_prod_growth_')));
    assert.deepEqual(subscriptionCalls.map(({ body }) => body.plan_details.plan_id), [
      'cashfree-plan-1',
      'cashfree-plan-2',
    ]);
    assert.equal(savedPlanIds.at(-1), 'cashfree-plan-2');
  } finally {
    global.fetch = previous.fetch;
    console.error = previous.consoleError;
    prisma.plan.update = previous.planUpdate;
    prisma.company.update = previous.companyUpdate;
    for (const [key, value] of [
      ['CASHFREE_APP_ID', previous.appId],
      ['CASHFREE_SECRET_KEY', previous.secret],
      ['CASHFREE_ENVIRONMENT', previous.environment],
      ['CASHFREE_API_URL', previous.apiUrl],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
