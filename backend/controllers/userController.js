const prisma = require('../prismaClient');

// ─── Shared validation helpers ────────────────────────────────────────────────
const validateUsername = (username) => {
  if (!username) return 'Username is required.';
  if (username.length < 5) return 'Username must be at least 5 characters.';
  return null;
};

const validatePassword = (password) => {
  if (!password) return 'Password is required.';
  if (password.length < 10) return 'Password must be at least 10 characters.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return 'Password must contain at least one special character.';
  return null;
};
// ──────────────────────────────────────────────────────────────────────────────

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

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      include: { userGroups: true }
    });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user', error: error.message });
  }
};

exports.getUserByUsername = async (req, res) => {
  try {
    const { username } = req.params;
    const user = await prisma.user.findUnique({
      where: { username },
      include: { userGroups: true }
    });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user by username', error: error.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { 
      username, firstName, firstname, lastName, lastname, email, password,
      phone, userlevel, dept_id, reporting_to, user_home_path, profile_image,
      ip, lastip
    } = req.body;

    // Validate username
    const usernameErr = validateUsername(username);
    if (usernameErr) return res.status(400).json({ message: usernameErr });

    // Validate password
    const passwordErr = validatePassword(password);
    if (passwordErr) return res.status(400).json({ message: passwordErr });

    // Generate USID-YYYY-XXXXXX format ID
    const currentYear = new Date().getFullYear();
    const prefix = `USID-${currentYear}-`;

    const lastUserThisYear = await prisma.user.findFirst({
      where: { id: { startsWith: prefix } },
      orderBy: { id: 'desc' }
    });

    let nextNumber = 1;
    if (lastUserThisYear && lastUserThisYear.id) {
      const lastNumberStr = lastUserThisYear.id.split('-').pop();
      const lastNumber = parseInt(lastNumberStr, 10);
      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }

    const userId = `${prefix}${String(nextNumber).padStart(6, '0')}`;
    
    const savedUser = await prisma.user.create({
      data: {
        id: userId,
        username,
        firstName: firstName || firstname || '',
        lastName: lastName || lastname || '',
        email,
        phone,
        password,
        status: 'Registered',
        userlevel: 0,
        role: 'Registered',
        dept_id: dept_id || null,
        reporting_to: reporting_to || null,
        user_home_path: user_home_path || null,
        profile_image: profile_image || null,
        ip: ip || req.ip || '127.0.0.1',
        lastip: lastip || req.ip || '127.0.0.1'
      }
    });
    res.status(201).json(savedUser);
  } catch (error) {
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'A field';
      return res.status(400).json({ message: `${field} already exists. Please choose a different one.` });
    }
    res.status(400).json({ message: 'Error creating user', error: error.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    // Prevent updating status or IDs via standard update route
    const updateData = { ...req.body };
    delete updateData.status;
    delete updateData.id;

    // Validate username if being changed
    if (updateData.username) {
      const usernameErr = validateUsername(updateData.username);
      if (usernameErr) return res.status(400).json({ message: usernameErr });
    }

    // Validate new password only if provided
    if (updateData.password) {
      const passwordErr = validatePassword(updateData.password);
      if (passwordErr) return res.status(400).json({ message: passwordErr });
    }
    
    if (updateData.userlevel !== undefined && updateData.userlevel !== '') {
      updateData.userlevel = parseInt(updateData.userlevel) || 1;
    }
    
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
      data: { 
        status: 'Manager',
        role: 'Manager',
        userlevel: 8
      }
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
    let newUserLevel = user.userlevel || 7;

    if (action === 'ban') {
      newStatus = 'Banned';
    } else if (action === 'unban') {
      newStatus = 'Manager';
      newUserLevel = 8;
    } else if (action === 'promoteToSuperAdmin') {
      newStatus = 'Admin';
      newUserLevel = 10;
    } else if (action === 'promoteToAdmin') {
      newStatus = 'Admin';
      newUserLevel = 9;
    } else if (action === 'demoteToManager' || action === 'promoteToManager') {
      newStatus = 'Manager';
      newUserLevel = 8;
    } else if (action === 'demoteToRegistered' || action === 'demoteToEmployee' || action === 'promoteToUser') {
      newStatus = 'Employee';
      newUserLevel = 7;
    } else {
      return res.status(400).json({ message: 'Invalid action' });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { 
        status: newStatus,
        userlevel: newUserLevel
      }
    });
    
    res.status(200).json(updatedUser);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(400).json({ message: 'Error updating user status', error: error.message });
  }
};

exports.updateUserGroups = async (req, res) => {
  try {
    const { id } = req.params;
    const { groupIds } = req.body;
    
    // Set exactly these groups
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        userGroups: {
          set: groupIds.map(gId => ({ id: gId }))
        }
      },
      include: { userGroups: true }
    });
    res.status(200).json(updatedUser);
  } catch (error) {
    res.status(400).json({ message: 'Error updating user groups', error: error.message });
  }
};

exports.updateHomePage = async (req, res) => {
  try {
    const { id } = req.params;
    const { homePagePath } = req.body;
    
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { homePagePath }
    });
    res.status(200).json(updatedUser);
  } catch (error) {
    res.status(400).json({ message: 'Error updating home page', error: error.message });
  }
};

exports.searchUsers = async (req, res) => {
  try {
    const { q, status } = req.query;
    if (!q || q.trim().length < 1) {
      return res.status(200).json([]);
    }

    const searchTerm = q.trim();

    // Scope search results by the requesting dashboard view's role
    let statusFilter;
    if (status === 'Admin') {
      statusFilter = { in: ['Admin'] };
    } else if (status === 'Manager') {
      statusFilter = { in: ['Manager'] };
    } else if (status === 'Employee') {
      statusFilter = { in: ['Employee', 'User'] };
    } else {
      // Default fallback — all non-superadmin statuses
      statusFilter = { in: ['Admin', 'Manager', 'Employee', 'User'] };
    }

    const users = await prisma.user.findMany({
      where: {
        status: statusFilter,
        OR: [
          { username: { contains: searchTerm, mode: 'insensitive' } },
          { firstName: { contains: searchTerm, mode: 'insensitive' } },
          { lastName: { contains: searchTerm, mode: 'insensitive' } },
          { id: { contains: searchTerm, mode: 'insensitive' } },
          { email: { contains: searchTerm, mode: 'insensitive' } },
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error searching users', error: error.message });
  }
};
