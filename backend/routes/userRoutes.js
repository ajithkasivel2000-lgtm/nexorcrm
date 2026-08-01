const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Define specific routes first
router.post('/activate', userController.activateUsers);
router.delete('/delete-inactive', userController.deleteInactiveUsers);
router.put('/:id/status', userController.updateStatus);
router.put('/:id/groups', userController.updateUserGroups);
router.put('/:id/homepage', userController.updateHomePage);

// General CRUD
router.get('/', userController.getUsers);
router.get('/search', userController.searchUsers);
router.get('/username/:username', userController.getUserByUsername);
router.get('/:id', userController.getUserById);
router.post('/', userController.createUser);
router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);

module.exports = router;
