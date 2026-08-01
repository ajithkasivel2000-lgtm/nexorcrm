const prisma = require('../prismaClient');

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Find user by username
    const user = await prisma.user.findUnique({ where: { username } });
    
    // For this prototype, we'll allow an admin/admin fallback if no users exist
    if (!user) {
      if (username === 'admin' && password === 'admin') {
        return res.status(200).json({ message: 'Login successful (fallback)', token: 'dummy_admin_token', user: { username: 'admin' } });
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Very basic password check (since password hashing isn't implemented in User.js yet)
    if (user.password !== password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Update last login
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    res.status(200).json({
      message: 'Login successful',
      token: 'dummy_token_' + user.id,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during login', error: error.message });
  }
};
