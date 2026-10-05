const test = require('node:test');
const assert = require('node:assert');

process.env.APP_URL = 'https://os.nexorcrm.com';
const prisma = require('../../prismaClient');
const tenant = require('../../utils/tenant');
const { normalizeDomain, assertClaimable, loginCompany } = require('../../utils/companyUrl');

test('domains are normalised from whatever was pasted', () => {
  assert.strictEqual(normalizeDomain('https://CRM.RoofOnWalls.com/login?x=1'), 'crm.roofonwalls.com');
  assert.strictEqual(normalizeDomain('crm.landmint.com:443'), 'crm.landmint.com');
  assert.strictEqual(normalizeDomain('crm.landmint.com.'), 'crm.landmint.com');
  assert.strictEqual(normalizeDomain('  '), null);
  assert.strictEqual(normalizeDomain(null), null);
});

test('a real client domain can be claimed', () => {
  assert.doesNotThrow(() => assertClaimable('crm.roofonwalls.com'));
  assert.doesNotThrow(() => assertClaimable('landmint.co.in'));
});

test('the platform address, its parent and its subdomains cannot be claimed', () => {
  for (const d of ['os.nexorcrm.com', 'nexorcrm.com', 'x.os.nexorcrm.com']) {
    assert.throws(() => assertClaimable(d), /platform/, d);
  }
});

test('junk, IPs and localhost are refused', () => {
  for (const d of ['localhost', '10.0.0.1', 'no_underscores.com', 'nodot', '-bad.com', 'a.b']) {
    assert.throws(() => assertClaimable(d), undefined, d);
  }
});

test('platform login is scoped to the default company and tenant login requires an active company', async () => {
  const originalFindUnique = prisma.company.findUnique;
  const companies = {
    'CMP-DEFAULT': { id: 'CMP-DEFAULT', slug: 'default', status: 'Active' },
    active: { id: 'active', slug: 'active', status: 'Active' },
    pending: { id: 'pending', slug: 'pending', status: 'Pending' },
  };
  prisma.company.findUnique = async ({ where }) => {
    if (where.id) return companies[where.id] || null;
    if (where.slug) return Object.values(companies).find((company) => company.slug === where.slug) || null;
    return null;
  };

  try {
    const platformLogin = await tenant.runResolving(() => loginCompany({
      hostname: 'os.nexorcrm.com',
      body: {},
    }));
    assert.equal(platformLogin.company.id, 'CMP-DEFAULT');

    const tenantLogin = await tenant.runResolving(() => loginCompany({
      hostname: 'os.nexorcrm.com',
      body: { company: 'active' },
    }));
    assert.equal(tenantLogin.company.id, 'active');

    const pendingLogin = await tenant.runResolving(() => loginCompany({
      hostname: 'os.nexorcrm.com',
      body: { company: 'pending' },
    }));
    assert.match(pendingLogin.error, /sign-in is unavailable/i);
  } finally {
    prisma.company.findUnique = originalFindUnique;
  }
});
