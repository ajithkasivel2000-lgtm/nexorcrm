const prisma = require('../prismaClient');

exports.getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { username, firstName, lastName, email, password } = req.body;
    
    // In a real app we'd hash the password here
    const savedUser = await prisma.user.create({
      data: {
        username,
        firstName,
        lastName,
        email,
        password
      }
    });
    res.status(201).json(savedUser);
  } catch (error) {
    res.status(400).json({ message: 'Error creating user', error: error.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    // Prevent updating status or IPs via standard update route
    const updateData = { ...req.body };
    delete updateData.status;
    delete updateData.id;
    
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData
    });
    res.status(200).json(updatedUser);
  } catch (error) {
    // Check if error is related to record not found
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(400).json({ message: 'Error updating user', error: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.user.delete({
      where: { id }
    });
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(500).json({ message: 'Error deleting user', error: error.message });
  }
};

exports.deleteInactiveUsers = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await prisma.user.deleteMany({
      where: {
        lastLoginAt: {
          lt: thirtyDaysAgo
        }
      }
    });
    res.status(200).json({ 
      message: 'Inactive users deleted successfully',
      deletedCount: result.count 
    });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting inactive users', error: error.message });
  }
};

exports.activateUsers = async (req, res) => {
  try {
    const { userIds } = req.body;
    if (!userIds || !userIds.length) {
      return res.status(400).json({ message: 'No users selected' });
    }
    await prisma.user.updateMany({
      where: {
        id: { in: userIds }
      },
      data: { status: 'Manager' } // default active status
    });
    res.status(200).json({ message: 'Users activated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error activating users', error: error.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    let newStatus = user.status;
    let newRole = user.role;

    if (action === 'ban') {
      newStatus = 'Banned';
    } else if (action === 'unban') {
      newStatus = user.role || 'Manager';
    } else if (action === 'promote') {
      newStatus = 'Admin';
      newRole = 'Admin';
    } else if (action === 'demote') {
      newStatus = 'Manager';
      newRole = 'Manager';
    } else {
      return res.status(400).json({ message: 'Invalid action' });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { status: newStatus, role: newRole }
    });
    
    res.status(200).json(updatedUser);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(400).json({ message: 'Error updating user status', error: error.message });
  }
};
