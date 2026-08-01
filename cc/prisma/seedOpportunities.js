const prisma = require('./prismaClient');
require('dotenv').config();

const dummyOpportunities = [
  {
    oppId: 'OPP_69c2298b03d70981',
    leadId: 'ENQ_69c22440ab4d1152',
    opportunityOwner: 'shagufta',
    stage: 'Site Visit Converted',
    createdAt: new Date('2026-03-24T11:34:59'),
    opportunityName: 'HARI PRASATH P',
    mobileNumber: '8524074657',
    emailAddress: 'hariprasath0520@gmail.com',
    enquiryProject: 'acres247'
  },
  {
    oppId: 'OPP_6952370c81d82364',
    leadId: 'ENQ_69522a55b4212752',
    opportunityOwner: '',
    stage: 'Site Visit Converted',
    createdAt: new Date('2025-12-29T13:38:44')
  },
  {
    oppId: 'OPP_69492451268b4126',
    leadId: 'ENQ_694903d36bb24414',
    opportunityOwner: 'shagufta',
    stage: 'Site Visit Converted',
    createdAt: new Date('2025-12-22T16:28:25')
  },
  {
    oppId: 'OPP_691ac94e2bc39207',
    leadId: 'ENQ_691ac8380d6d3248',
    opportunityOwner: '',
    stage: 'Site Visit Converted',
    createdAt: new Date('2025-11-17T12:35:50')
  }
];

async function seed() {
  try {
    console.log('Connected to PostgreSQL via Prisma. Seeding data...');
    // Clear existing opportunities (optional)
    await prisma.opportunity.deleteMany({});
    
    // Insert dummy data
    await prisma.opportunity.createMany({ data: dummyOpportunities });
    console.log('Successfully seeded Opportunities!');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding data:', err);
    process.exit(1);
  }
}

seed();
