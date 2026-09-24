const express = require('express');
const router = express.Router();
const { authMiddleware, requireSuperAdmin } = require('../middleware/authMiddleware');
const { requirePermission } = require('../utils/permissions');
const projectController = require('../controllers/projectController');
const inventory = require('../controllers/projectInventoryController');

// Projects are business data (contacts, pricing, targets) — signed in.
router.get('/', authMiddleware, projectController.getProjects);
router.get('/:id/summary', authMiddleware, projectController.getProjectSummary);
router.get('/:id', authMiddleware, projectController.getProjectById);

// Buildings and units. Reads are signed in: unit inventory carries pricing.
router.get('/:id/inventory', authMiddleware, inventory.inventory);
router.get('/:id/buildings', authMiddleware, inventory.listBuildings);
router.post('/:id/buildings', authMiddleware, requirePermission('projects', 'edit'), inventory.createBuilding);
router.put('/:id/buildings/:buildingId', authMiddleware, requirePermission('projects', 'edit'), inventory.updateBuilding);
router.delete('/:id/buildings/:buildingId', authMiddleware, requirePermission('projects', 'edit'), inventory.deleteBuilding);

router.get('/:id/units', authMiddleware, inventory.listUnits);
router.post('/:id/units', authMiddleware, requirePermission('projects', 'edit'), inventory.createUnit);
router.post('/:id/units/bulk', authMiddleware, requirePermission('projects', 'edit'), inventory.bulkCreateUnits);
router.put('/:id/units/:unitId', authMiddleware, requirePermission('projects', 'edit'), inventory.updateUnit);
router.delete('/:id/units/:unitId', authMiddleware, requirePermission('projects', 'edit'), inventory.deleteUnit);
router.post('/', authMiddleware, requirePermission('projects', 'create'), projectController.createProject);
router.put('/:id', authMiddleware, requirePermission('projects', 'edit'), projectController.updateProject);
router.delete('/:id', authMiddleware, requirePermission('projects', 'delete'), requireSuperAdmin, projectController.deleteProject);

module.exports = router;
