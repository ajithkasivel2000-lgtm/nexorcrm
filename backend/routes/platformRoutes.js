const express = require('express');
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const c = require('../controllers/platformController');
const billing = require('../controllers/billingController');

/** /api/platform — the platform owner's company management. */
const platform = express.Router();
platform.use(authMiddleware, c.requirePlatformAdmin);
platform.get('/companies', c.listCompanies);
platform.post('/companies', c.createCompany);
platform.put('/companies/:id', c.updateCompany);
platform.post('/companies/:id/rotate-key', c.rotateCompanyKey);
platform.post('/companies/:id/billing', billing.companyBilling);
platform.get('/plans', billing.listPlans);
platform.post('/plans', billing.createPlan);
platform.put('/plans/:id', billing.updatePlan);

/** /api/company — a company's own administrators. */
const company = express.Router();
company.get('/', authMiddleware, requireAdmin, c.myCompany);
company.post('/rotate-key', authMiddleware, requireAdmin, c.rotateMyKey);
company.put('/branding', authMiddleware, requireAdmin, require('../controllers/brandingController').update);

module.exports = { platform, company };
