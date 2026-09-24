const prisma = require('../prismaClient');
const tenant = require('../utils/tenant');

/**
 * For the public endpoints (website and campaign lead forms): which company a
 * request is for, from the company's public key.
 *
 * The key is sent as the X-Company-Key header, or `key` in the query string
 * or JSON body — whichever the form builder can manage. It is public by design
 * (it sits in a website's HTML) and only identifies the company; it grants
 * nothing but the ability to submit a lead, which is what the form is for.
 *
 * Runs the rest of the request inside that company (utils/tenant.js).
 */
function requireCompanyKey(req, res, next) {
  const key = String(req.headers['x-company-key'] || req.query?.key || req.body?.key || '').trim();
  if (!key) {
    return res.status(400).json({ message: 'A company key is required (X-Company-Key header or ?key=).' });
  }
  tenant.runResolving(async () => {
    try {
      const company = await prisma.company.findUnique({ where: { publicKey: key } });
      if (!company || company.status !== 'Active') {
        return res.status(404).json({ message: 'Unknown company key.' });
      }
      tenant.adopt(company.id);
      req.companyId = company.id;
      return next();
    } catch (error) {
      console.error('Company key lookup failed:', error.message);
      return res.status(500).json({ message: 'Could not accept the request.' });
    }
  });
}

module.exports = { requireCompanyKey };
