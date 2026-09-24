/**
 * Fill a company's empty default lists: lead statuses, sources, call outcomes,
 * RRQ types, project statuses and types, departments, and email templates.
 * Lists that already have entries are left untouched, so this is safe to run
 * again.
 *
 *   npm run seed:defaults                 # the original company
 *   COMPANY_ID=<id> npm run seed:defaults # another company
 */
require('dotenv').config();
const tenant = require('../utils/tenant');
const { seedDefaults } = require('../utils/provisioning');

const companyId = process.env.COMPANY_ID || tenant.DEFAULT_COMPANY_ID;

tenant.runWithCompany(companyId, seedDefaults)
  .then((filled) => {
    console.log(filled.length ? `Filled: ${filled.join(', ')}` : 'Every default list already has entries; nothing to do.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seeding failed:', error.message);
    process.exit(1);
  });
