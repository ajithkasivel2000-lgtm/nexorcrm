const prisma = require('../prismaClient');
const tenant = require('./tenant');

/**
 * A company's own web address.
 *
 * A client can run the CRM on its own domain (crm.roofonwalls.com) instead of
 * the platform's. The domain is set by the platform owner, stored on the
 * company, and pointed at this server with DNS and nginx.
 *
 * Links in emails use it, but it is never taken from the request: the Host
 * header is whatever the sender says it is, and building a password-reset
 * link from it would let anyone send a real token to a site they control.
 */

const platformUrl = () => String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
const platformHost = () => { try { return new URL(platformUrl()).hostname.toLowerCase(); } catch { return ''; } };

/** "https://CRM.Example.com/login" -> "crm.example.com"; null when blank. */
function normalizeDomain(value) {
  let v = String(value ?? '').trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  return v;
}

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Throws a 400-style error unless `domain` is a domain a company may claim. */
function assertClaimable(domain) {
  const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!DOMAIN_RE.test(domain)) fail('Enter a domain like crm.yourcompany.com.');
  const own = platformHost();
  // Not the platform's address, a name under it, or a parent of it.
  if (own && (domain === own || domain.endsWith(`.${own}`) || own.endsWith(`.${domain}`))) {
    fail('That is the platform\'s own address.');
  }
  if (domain === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(domain)) fail('Use a domain name, not an IP address.');
}

/** Base URL for a company's links: its own domain, else the platform's. */
async function companyBaseUrl(companyId) {
  if (companyId) {
    const company = await tenant.runAsSystem(() => prisma.company.findUnique({ where: { id: companyId }, select: { customDomain: true } }));
    if (company?.customDomain) return `https://${company.customDomain}`;
  }
  return platformUrl() || null;
}

/** The active company whose own domain this is, or null. */
async function companyByHost(host) {
  const domain = normalizeDomain(host);
  if (!domain || domain === platformHost()) return null;
  const company = await tenant.runAsSystem(() => prisma.company.findUnique({ where: { customDomain: domain } }));
  return company && company.status === 'Active' ? company : null;
}

module.exports = { normalizeDomain, assertClaimable, companyBaseUrl, companyByHost, platformUrl };
