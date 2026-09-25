const test = require('node:test');
const assert = require('node:assert');

process.env.APP_URL = 'https://os.nexorcrm.com';
const { normalizeDomain, assertClaimable } = require('../../utils/companyUrl');

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
