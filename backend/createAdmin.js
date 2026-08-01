const prisma = require('./prismaClient');
require('dotenv').config();

async function createAdmin() {
  try {
    const adminUser = await prisma.user.upsert({
      where: { username: 'admin' },
      update: {},
      create: {
        username: 'admin',
        password: 'password123',
        email: 'admin@propcrm.com',
        firstName: 'System',
        lastName: 'Admin',
        status: 'Active',
      },
    });

    console.log('Admin user created successfully:');
    console.log('Username: admin');
    console.log('Password: password123');
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin:', error);
    process.exit(1);
  }
}

createAdmin();
