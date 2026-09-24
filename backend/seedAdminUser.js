/**
 * Creates (or repairs) the built-in `admin` account.
 *
 * Run once against a fresh database:
 *   npm run seed:admin
 *
 * The password is read from ADMIN_PASSWORD so a real one never has to be
 * committed; without it the script refuses to run rather than quietly
 * installing a well-known default that then reaches production.
 *
 * It is stored as a bcrypt hash. Login accepts a plain-text column only as a
 * legacy upgrade path (see controllers/authController.js) — nothing should be
 * writing a new one.
 */
const bcrypt = require('bcryptjs');
const prisma = require('./prismaClient');
const tenant = require('./utils/tenant');
require('dotenv').config();

async function seedAdminUser() {
  const plain = process.env.ADMIN_PASSWORD;
  if (!plain || plain.length < 8) {
    console.error('Set ADMIN_PASSWORD (at least 8 characters) before running this script.');
    process.exit(1);
  }

  const password = await bcrypt.hash(plain, 10);

  await prisma.user.upsert({
    where: { username: 'admin' },
    // An existing admin keeps its profile; only the credential and the role
    // are reset, which is the reason to re-run this.
    update: { password, status: 'Admin', role: 'Admin' },
    create: {
      username: 'admin',
      firstName: 'System',
      lastName: 'Admin',
      email: 'admin@nexorcrm.com',
      password,
      status: 'Admin',
      role: 'Admin',
    },
  });

  console.log('Admin account ready. Username: admin');
}

// The platform's first company; COMPANY_ID picks another.
tenant.runWithCompany(process.env.COMPANY_ID || tenant.DEFAULT_COMPANY_ID, seedAdminUser)
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
