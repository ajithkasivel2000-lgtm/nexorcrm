const prisma = require('./prismaClient');

async function fix() {
  await prisma.project.deleteMany({ where: { projectName: 'Kite Festival by Navilfarms' } });
  console.log('Deleted Kite Festival project.');
  await prisma.$disconnect();
}
fix().catch(console.error);
