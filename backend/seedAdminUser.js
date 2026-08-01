const prisma = require('./prismaClient');

async function seedAdminPassword() {
  const user = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (user) {
    await prisma.user.update({
      where: { username: 'admin' },
      data: { password: 'password123', status: 'Admin' }
    });
    console.log('Updated existing admin user password to password123 and status to Admin');
  } else {
    await prisma.user.create({
      data: {
        username: 'admin',
        firstName: 'System',
        lastName: 'Admin',
        email: 'admin@propcrm.com',
        password: 'password123',
        status: 'Admin',
        role: 'Admin'
      }
    });
    console.log('Created admin user with password password123 and status Admin');
  }
  await prisma.$disconnect();
}

seedAdminPassword().catch(err => {
  console.error(err);
  process.exit(1);
});
