const prisma = require('./prismaClient');

async function main() {
  console.log('Clearing existing leads...');
  await prisma.lead.deleteMany({});
  
  console.log('Inserting dashboard test data for specific projects...');

  const leadsToCreate = [];
  const addLead = (project, status, primarySource, tertiarySource) => {
    leadsToCreate.push({
      name: 'Test Lead',
      mobile: '9999999999',
      project,
      status,
      primarySource,
      tertiarySource,
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
    });
  };

  // 1. PROJECT: Vaighousing (1 lead)
  addLead('Vaighousing', 'Rejected', 'Social Media', 'FB Ads');

  // 1b. PROJECT: Codename Flow (24 leads)
  addLead('Codename Flow', 'Site Visit', 'Outdoor Marketing', null);
  addLead('Codename Flow', 'Site Visit Done', 'Outdoor Marketing', null);
  for(let i=0; i<5; i++) addLead('Codename Flow', 'Rejected', 'Social Media', 'FB Ads');
  for(let i=0; i<5; i++) addLead('Codename Flow', 'Attempted', 'Outdoor Marketing', null);
  for(let i=0; i<3; i++) addLead('Codename Flow', 'Interested', 'Outdoor Marketing', null);
  for(let i=0; i<9; i++) addLead('Codename Flow', 'Missed Follow Up', 'Outdoor Marketing', null);

  // 1c. PROJECT: Song Of Silence (80 leads)
  // New Lead(28), Attempted(13), Interested(1), Site Visit(7), Rejected(6), Missed Follow Up(18), Site Visit Done(5), Site Visit Scheduled(2)
  for(let i=0; i<28; i++) addLead('Song Of Silence', 'New Lead', 'Outdoor Marketing', null);
  for(let i=0; i<13; i++) addLead('Song Of Silence', 'Attempted', 'Outdoor Marketing', null);
  for(let i=0; i<1; i++) addLead('Song Of Silence', 'Interested', 'Outdoor Marketing', null);
  for(let i=0; i<7; i++) addLead('Song Of Silence', 'Site Visit', 'Outdoor Marketing', null);
  for(let i=0; i<6; i++) addLead('Song Of Silence', 'Rejected', 'Social Media', 'FB Ads');
  for(let i=0; i<18; i++) addLead('Song Of Silence', 'Missed Follow Up', 'Outdoor Marketing', null);
  for(let i=0; i<5; i++) addLead('Song Of Silence', 'Site Visit Done', 'Outdoor Marketing', null);
  for(let i=0; i<2; i++) addLead('Song Of Silence', 'Site Visit Scheduled', 'Outdoor Marketing', null);

  // 1d. PROJECT: acres247 (3 leads)
  // Site Visit (1), Missed Follow Up (1), Site Visit Scheduled (1)
  addLead('acres247', 'Site Visit', 'Outdoor Marketing', null);
  addLead('acres247', 'Missed Follow Up', 'Outdoor Marketing', null);
  addLead('acres247', 'Site Visit Scheduled', 'Direct Walk In', null);

  // 1e. PROJECT: puravankaracodenameflow (1 lead)
  // New Lead (1)
  addLead('puravankaracodenameflow', 'New Lead', 'Social Media', 'FB Ads');

  // 1f. PROJECT: BCD Royale (4 leads)
  // New Lead (2), Attempted (1), Missed Follow Up (1)
  for(let i=0; i<2; i++) addLead('BCD Royale', 'New Lead', 'Social Media', 'FB Ads');
  addLead('BCD Royale', 'Attempted', 'Social Media', 'FB Ads');
  addLead('BCD Royale', 'Missed Follow Up', 'Outdoor Marketing', null);

  // 2. PROJECT: Navileforms (167 leads)
  for(let i=0; i<2; i++) addLead('Navileforms', 'Site Visit', 'Outdoor Marketing', null);
  for(let i=0; i<2; i++) addLead('Navileforms', 'Site Visit Scheduled', 'Outdoor Marketing', null);
  for(let i=0; i<33; i++) addLead('Navileforms', 'Rejected', 'Social Media', 'FB Ads');
  for(let i=0; i<2; i++) addLead('Navileforms', 'New Lead', 'Channel Partner', null);
  for(let i=0; i<4; i++) addLead('Navileforms', 'New Lead', 'Direct Walk In', null);
  for(let i=0; i<3; i++) addLead('Navileforms', 'Interested', 'Outdoor Marketing', null);
  addLead('Navileforms', 'Interested', 'Website', 'Landing Page');
  for(let i=0; i<19; i++) addLead('Navileforms', 'Attempted', 'Website', 'Landing Page');
  for(let i=0; i<39; i++) addLead('Navileforms', 'Attempted', 'Social Media', 'FB Ads');
  for(let i=0; i<62; i++) addLead('Navileforms', 'Missed Follow Up', 'Social Media', 'FB Ads');

  // 3. PROJECT: Other Project (492 - 1 - 24 - 80 - 3 - 1 - 4 - 167 = 212 leads)
  // Total leads per status: New Lead(54), Attempted(132), Interested(42), Missed Follow Up(179), Site Visit(11), Rejected(63), Site Visit Done(6), Site Visit Scheduled(5)
  // Used overall:
  // New Lead: 28 (Song) + 6 (Nav) + 1 (pura) + 2 (bcd) = 37. Left: 17
  // Attempted: 5 (Code) + 13 (Song) + 58 (Nav) + 1 (bcd) = 77. Left: 55
  // Interested: 3 (Code) + 1 (Song) + 4 (Nav) = 8. Left: 34
  // Missed Follow Up: 9 (Code) + 18 (Song) + 1 (acres) + 62 (Nav) + 1 (bcd) = 91. Left: 88
  // Site Visit: 1 (Code) + 7 (Song) + 1 (acres) + 2 (Nav) = 11. Left: 0
  // Rejected: 1 (Vaig) + 5 (Code) + 6 (Song) + 33 (Nav) = 45. Left: 18
  // Site Visit Done: 1 (Code) + 5 (Song) = 6. Left: 0
  // Site Visit Scheduled: 2 (Song) + 1 (acres) + 2 (Nav) = 5. Left: 0

  for(let i=0; i<17; i++) addLead('Other Project', 'New Lead', 'Social Media', 'FB Ads');
  for(let i=0; i<55; i++) addLead('Other Project', 'Attempted', 'Social Media', 'FB Ads');
  for(let i=0; i<34; i++) addLead('Other Project', 'Interested', 'Outdoor Marketing', null);
  for(let i=0; i<88; i++) addLead('Other Project', 'Missed Follow Up', 'Outdoor Marketing', null);
  for(let i=0; i<18; i++) addLead('Other Project', 'Rejected', 'Social Media', 'FB Ads');

  // Insert to DB
  await prisma.lead.createMany({
    data: leadsToCreate
  });

  console.log('Seed completed successfully! Total leads:', leadsToCreate.length);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
