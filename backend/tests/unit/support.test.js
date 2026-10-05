process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unused@localhost:1/unused';

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../prismaClient');
const mailer = require('../../utils/mailer');
const tenant = require('../../utils/tenant');

let mockSendMail = async () => ({ status: 'sent' });
let mockAdmins = [];
let mockMailSettings = {
  enabled: true,
  smtpHost: 'smtp.example.test',
  defaultCC: 'copy@example.test',
  defaultBCC: 'blind@example.test',
};
mailer.sendMail = (...args) => mockSendMail(...args);
prisma.user.findMany = async () => mockAdmins;
prisma.mailSetting.findFirst = async () => mockMailSettings;
delete require.cache[require.resolve('../../controllers/supportController')];
const supportController = require('../../controllers/supportController');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function submit(body) {
  const res = response();
  await supportController.submit({ body }, res);
  return res;
}

test('workspace support validates the public form before sending', async () => {
  let sent = false;
  mockSendMail = async () => { sent = true; return { status: 'sent' }; };

  const result = await submit({
    email: 'invalid-address',
    topic: 'Not a topic',
    message: '',
  });

  assert.equal(result.statusCode, 400);
  assert.equal(sent, false);
});

test('workspace support emails application owner with safely escaped request details', async () => {
  const previousOwnerEmail = process.env.APPLICATION_OWNER_EMAIL;
  process.env.APPLICATION_OWNER_EMAIL = 'owner@example.test';
  let sentMessage;
  let sentOptions;
  mockSendMail = async (message, options) => {
    sentMessage = message;
    sentOptions = options;
    return { status: 'sent' };
  };

  try {
    const result = await submit({
      email: 'person@example.test',
      topic: 'Company link problem',
      message: '<script>alert("no")</script>\nHelp & review',
      companySlug: 'landmint',
    });

    assert.equal(result.statusCode, 200);
    assert.match(result.body.message, /sent/i);
    assert.equal(sentMessage.to, 'owner@example.test');
    assert.equal(sentMessage.cc, 'copy@example.test');
    assert.equal(sentMessage.bcc, 'blind@example.test');
    assert.equal(sentMessage.category, 'workspace-support');
    assert.equal(sentOptions.companyId, tenant.DEFAULT_COMPANY_ID);
    assert.match(sentMessage.html, /&lt;script&gt;/);
    assert.match(sentMessage.html, /Help &amp; review/);
    assert.doesNotMatch(sentMessage.html, /<script>/);
    assert.match(result.body.message, /cc copy@example\.test/);
    assert.match(result.body.message, /bcc 1 hidden/);
  } finally {
    if (previousOwnerEmail === undefined) delete process.env.APPLICATION_OWNER_EMAIL;
    else process.env.APPLICATION_OWNER_EMAIL = previousOwnerEmail;
  }
});

test('workspace support falls back to the platform admin and reports queued delivery', async () => {
  const previousOwnerEmail = process.env.APPLICATION_OWNER_EMAIL;
  delete process.env.APPLICATION_OWNER_EMAIL;
  mockAdmins = [{ email: 'platform-owner@example.test' }];
  let recipient;
  mockSendMail = async (message) => {
    recipient = message.to;
    return { status: 'queued', id: 'mail-1' };
  };

  try {
    const result = await submit({
      email: 'person@example.test',
      topic: 'Workspace access',
      message: 'I cannot open my workspace.',
    });

    assert.equal(result.statusCode, 200);
    assert.equal(recipient, 'platform-owner@example.test');
    assert.match(result.body.message, /queued/i);
  } finally {
    mockAdmins = [];
    if (previousOwnerEmail === undefined) delete process.env.APPLICATION_OWNER_EMAIL;
    else process.env.APPLICATION_OWNER_EMAIL = previousOwnerEmail;
  }
});

test('workspace support returns a service error when no owner inbox is configured', async () => {
  const previousOwnerEmail = process.env.APPLICATION_OWNER_EMAIL;
  delete process.env.APPLICATION_OWNER_EMAIL;
  mockAdmins = [];

  try {
    const result = await submit({
      email: 'person@example.test',
      topic: 'Other',
      message: 'Please help.',
    });

    assert.equal(result.statusCode, 503);
    assert.match(result.body.message, /not configured/i);
  } finally {
    mockAdmins = [];
    if (previousOwnerEmail === undefined) delete process.env.APPLICATION_OWNER_EMAIL;
    else process.env.APPLICATION_OWNER_EMAIL = previousOwnerEmail;
  }
});
