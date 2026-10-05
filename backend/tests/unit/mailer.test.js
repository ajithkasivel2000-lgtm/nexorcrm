process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unused@localhost:1/unused';

const test = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const prisma = require('../../prismaClient');
const tenant = require('../../utils/tenant');
const mailer = require('../../utils/mailer');

test('public/system email sends use an explicit tenant for settings and outbox rows', async () => {
  const previous = {
    mailSettingFindFirst: prisma.mailSetting.findFirst,
    companyFindUnique: prisma.company.findUnique,
    outboxCreate: prisma.emailOutbox.create,
    outboxUpdate: prisma.emailOutbox.update,
    createTransport: nodemailer.createTransport,
  };
  const tenantReads = [];
  let outboxData;

  prisma.mailSetting.findFirst = async () => {
    tenantReads.push(tenant.currentCompanyId());
    return {
      enabled: true,
      smtpHost: 'smtp.example.test',
      smtpPort: '587',
      smtpAuth: 'False',
      starttls: 'True',
      fromName: 'NexorCRM',
      fromEmail: 'noreply@example.test',
    };
  };
  prisma.company.findUnique = async ({ where }) => ({ id: where.id, name: 'Platform' });
  prisma.emailOutbox.create = async ({ data }) => {
    outboxData = data;
    return { ...data, id: 'outbox-test' };
  };
  prisma.emailOutbox.update = async ({ where, data }) => ({ id: where.id, ...data });
  nodemailer.createTransport = () => ({ sendMail: async () => ({ messageId: 'sent-test' }) });

  try {
    const result = await tenant.runAsSystem(() => mailer.sendMail({
      to: 'owner@example.test',
      subject: 'Verify email',
      html: '<p>Verify</p>',
    }, { companyId: tenant.DEFAULT_COMPANY_ID }));

    assert.equal(result.status, 'sent');
    assert.equal(tenantReads[0], tenant.DEFAULT_COMPANY_ID);
    assert.equal(outboxData.companyId, tenant.DEFAULT_COMPANY_ID);
  } finally {
    prisma.mailSetting.findFirst = previous.mailSettingFindFirst;
    prisma.company.findUnique = previous.companyFindUnique;
    prisma.emailOutbox.create = previous.outboxCreate;
    prisma.emailOutbox.update = previous.outboxUpdate;
    nodemailer.createTransport = previous.createTransport;
  }
});
