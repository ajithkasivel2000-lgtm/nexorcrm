const prisma = require('./prismaClient');
require('dotenv').config();

const projects = [
  { projectName: 'Navileforms', projectType: 'Residential', status: 'Active' },
  { projectName: 'Vaighousing', projectType: 'Residential', status: 'Active' },
  { projectName: 'Codename Flow', projectType: 'Residential', status: 'Active' },
  { projectName: 'Song Of Silence', projectType: 'Residential', status: 'Active' },
  { projectName: 'acres247', projectType: 'Residential', status: 'Active' },
  { projectName: 'puravankaracodenameflow', projectType: 'Residential', status: 'Active' },
  { projectName: 'purvasilversky', projectType: 'Residential', status: 'Active' },
  { projectName: 'BCD Royale', projectType: 'Residential', status: 'Active' },
];

async function run() {
  for (const p of projects) {
    try {
      await prisma.project.upsert({
        where: { projectName: p.projectName },
        update: {},
        create: p
      });
      console.log('Seeded:', p.projectName);
    } catch(e) {
      console.log('Skip (exists):', p.projectName, e.message);
    }
  }
  await prisma.$disconnect();
  console.log('Done!');
}
run();
