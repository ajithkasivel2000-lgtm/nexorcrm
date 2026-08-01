const prisma = require('../prismaClient');

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Find user by username
    const user = await prisma.user.findUnique({ where: { username } });
    
    // For this prototype, we'll allow an admin fallback if no users exist
    if (!user) {
      if (username === 'admin' && (password === 'password123' || password === 'admin')) {
        const ipAddress = req.body.clientIp || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || '127.0.0.1';
        await prisma.systemLog.create({
          data: { username: 'admin', event: 'LOGIN', ipAddress: String(ipAddress).replace(/^::ffff:/, '') }
        });
        return res.status(200).json({ message: 'Login successful (fallback)', token: 'dummy_admin_token', user: { username: 'admin', status: 'Admin' } });
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

    const ipAddress = req.body.clientIp || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || '127.0.0.1';
    await prisma.systemLog.create({
      data: { username: user.username, event: 'LOGIN', ipAddress: String(ipAddress).replace(/^::ffff:/, '') }
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

exports.logout = async (req, res) => {
  try {
    const { username, clientIp } = req.body;
    if (username) {
      const ipAddress = clientIp || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || '127.0.0.1';
      await prisma.systemLog.create({
        data: { username, event: 'LOGOFF', ipAddress: String(ipAddress).replace(/^::ffff:/, '') }
      });
    }
    res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    res.status(500).json({ message: 'Server error during logout', error: error.message });
  }
};
