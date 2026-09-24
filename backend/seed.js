require('dotenv').config();

async function seed() {
  try {
    console.log('Connected to PostgreSQL via Prisma for seeding...');

    console.log('Nothing to seed: Property and Service modules were removed from this app.');

    process.exit(0);
  } catch (e) {
    console.error('Seed error:', e);
    process.exit(1);
  }
}

seed();
