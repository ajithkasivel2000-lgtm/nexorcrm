const express = require('express');
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const c = require('../controllers/platformController');

/** /api/platform — the platform owner's company management. */
const platform = express.Router();
platform.use(authMiddleware, c.requirePlatformAdmin);
platform.get('/companies', c.listCompanies);
platform.post('/companies', c.createCompany);
platform.put('/companies/:id', c.updateCompany);
platform.post('/companies/:id/rotate-key', c.rotateCompanyKey);

/** /api/company — a company's own administrators. */
const company = express.Router();
company.get('/', authMiddleware, requireAdmin, c.myCompany);
company.post('/rotate-key', authMiddleware, requireAdmin, c.rotateMyKey);

module.exports = { platform, company };
