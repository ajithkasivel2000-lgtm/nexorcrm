const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');

// Get permissions for a specific role
router.get('/:role', async (req, res) => {
  try {
    const role = req.params.role;

    if (!prisma.pageAccess) {
      console.error('prisma.pageAccess is not available - run: npx prisma generate');
      return res.status(500).json({ message: 'PageAccess model not available. Run prisma generate.' });
    }

    const pageAccess = await prisma.pageAccess.findUnique({
      where: { role }
    });
    
    if (!pageAccess) {
      return res.json({ role, permissions: [] });
    }
    
    let permissions = pageAccess.permissions;
    if (typeof permissions === 'string') {
      try { permissions = JSON.parse(permissions); } catch (e) { permissions = []; }
    }
    if (!Array.isArray(permissions)) permissions = [];

    res.json({ role, permissions });
  } catch (error) {
    console.error('Error fetching page access:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// Update permissions for a specific role
router.put('/:role', async (req, res) => {
  try {
    const role = req.params.role;
    let { permissions } = req.body;

    if (!prisma.pageAccess) {
      console.error('prisma.pageAccess is not available - run: npx prisma generate');
      return res.status(500).json({ message: 'PageAccess model not available. Run: npx prisma generate' });
    }

    // Ensure permissions is a valid array
    if (!Array.isArray(permissions)) {
      permissions = [];
    }

    // Explicitly cast each item so Prisma can store it as Json
    const sanitized = permissions.map(p => ({
      page: String(p.page || ''),
      view: Boolean(p.view),
      create: Boolean(p.create),
      edit: Boolean(p.edit),
      delete: Boolean(p.delete),
      export: Boolean(p.export),
    }));

    const pageAccess = await prisma.pageAccess.upsert({
      where: { role },
      update: {
        permissions: sanitized,
      },
      create: {
        role,
        permissions: sanitized
      }
    });
    
    res.json({ message: 'Permissions saved successfully', pageAccess });
  } catch (error) {
    console.error('Error saving page access - full error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

module.exports = router;
