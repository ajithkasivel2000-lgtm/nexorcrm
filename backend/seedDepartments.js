/**
 * Seeds the Department table with a starter set.
 *
 * The user table always had dept_id, but there was never a department table to
 * point it at — the User 360 organization tab is the first consumer. Run once:
 *   node seedDepartments.js
 *
 * Idempotent: departments that already exist are left alone.
 */
const prisma = require('./prismaClient');

const DEPARTMENTS = [
  { name: 'Sales', description: 'Presales and field sales' },
  { name: 'Marketing', description: 'Campaigns and brand' },
  { name: 'Operations', description: 'Delivery and support' },
  { name: 'Finance', description: 'Accounts and billing' },
  { name: 'Human Resources', description: 'People and hiring' },
  { name: 'Administration', description: 'System and office admin' },
];

async function seed() {
  let created = 0;
  for (const dept of DEPARTMENTS) {
    const existing = await prisma.department.findUnique({ where: { name: dept.name } });
    if (!existing) {
      await prisma.department.create({ data: dept });
      created += 1;
    }
  }
  console.log(`Departments seeded (${created} created, ${DEPARTMENTS.length - created} already present).`);
  await prisma.$disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
