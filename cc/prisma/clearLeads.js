const prisma = require('./prismaClient');
async function clear() {
  await prisma.leadLog.deleteMany({});
  await prisma.lead.deleteMany({});
  console.log('Cleared all dummy leads');
  await prisma.$disconnect();
}
clear().catch(console.error);
