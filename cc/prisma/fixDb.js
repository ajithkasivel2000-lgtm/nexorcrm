const prisma = require('./prismaClient');

async function fix() {
  await prisma.project.deleteMany({ where: { projectName: 'puravankaracodenamef low' } });
  await prisma.project.deleteMany({ where: { projectName: 'puravankaracodenameflow' } });
  console.log('Deleted typo projects.');
  await prisma.$disconnect();
}
fix().catch(console.error);
