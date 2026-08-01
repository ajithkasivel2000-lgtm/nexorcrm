const prisma = require('./prismaClient');
require('dotenv').config();

const INITIAL_PROPERTIES = [
  {
    propertyId: 'PROP_2267curl',
    name: 'Commercial Office Space for Rent near Jayadeva Junction, Banashankari',
    category: 'commercial',
    type: 'Commercial Office Space',
    propertyFor: 'rent',
    city: 'Bangalore',
    locality: 'Banashankari',
    price: ',175,000/month',
    discountPrice: ',165,000/month',
    beds: '0',
    baths: '2',
    sqft: '2,400',
    garage: '2',
    image: 'https://www.propsuggest.com/assets/imag/ban1.jpg',
    lat: 12.9141,
    lng: 77.5736,
    featured: true,
    hot: true,
    createdBy: 'avinash',
    createdOn: '2026-05-15 11:52',
    description: 'Highly premium commercial office space located right next to the Jayadeva Junction Metro Station. Ideal for software development centers, startups, corporate offices, or consultancy services. Features premium flooring, central air-conditioning wiring, and full power backup.',
    possessionStatus: 'Ready to Move',
    bookingAmount: ',14,00,000',
    parking: 'Available (2 Car, 6 Bike)',
    floors: '2nd Floor of 5 Floors',
    visitorParking: 'Yes',
    powerBackup: '100% DG Backup',
    fireSafety: 'Compliant with Sprinklers'
  },
  {
    propertyId: 'PROP_8821kxvc',
    name: '3 BHK Apartment for Rent in HAL 2nd Stage, Indiranagar',
    category: 'residential',
    type: 'Flat/Apartment',
    propertyFor: 'rent',
    city: 'Bangalore',
    locality: 'Indiranagar',
    price: ',155,000/month',
    discountPrice: ',150,000/month',
    beds: '3',
    baths: '3',
    sqft: '1,850',
    garage: '1',
    image: 'https://www.propsuggest.com/assets/imag/ban1.jpg',
    lat: 12.9719,
    lng: 77.6412,
    featured: true,
    hot: false,
    createdBy: 'avinash',
    createdOn: '2026-05-15 12:10',
    description: 'Beautiful 3 BHK flat situated in the heart of Indiranagar, HAL 2nd Stage. Quiet and peaceful neighborhood with immediate access to supermarkets, retail stores, and top restaurants. Semi-furnished with modular kitchen, wardrobes, and chimney.',
    possessionStatus: 'Ready to Move',
    bookingAmount: ',12,50,000',
    parking: '1 Covered Car Park',
    floors: '3rd Floor of 4 Floors',
    visitorParking: 'No',
    powerBackup: 'Common Area Backup',
    fireSafety: 'Extinguishers Installed'
  }
];

const INITIAL_SERVICES = [
  {
    title: 'Property Management',
    slug: 'property-management',
    category: 'Property buying tips',
    mode: 'Hybrid',
    featuredImagePreview: 'https://www.propsuggest.com/assets/imag/ban1.jpg',
    bannerImagePreview: 'https://www.propsuggest.com/assets/imag/ban1.jpg',
    shortDesc: 'Professional property management services to handle your real estate assets efficiently, including tenant management, maintenance, rent collection, and complete property care.',
    detailedDesc: 'Our Property Management service is designed to help property owners manage their real estate assets without stress. Whether you own residential apartments, villas, or commercial spaces, we take care of everything from tenant sourcing to maintenance and financial reporting. We ensure your property remains well-maintained, occupied, and profitable while you enjoy a completely hassle-free experience.',
    sections: {
      create: [
        {
          title: 'Tenant Management & Leasing',
          content: 'We handle tenant onboarding, verification, lease agreements, and smooth move-in processes to ensure reliable and long-term tenants.',
          imagePreview: 'https://www.propsuggest.com/assets/imag/ban1.jpg'
        }
      ]
    },
    propertyType: 'Apartment, Villa, Plot, Commercial Property',
    locations: 'Bangalore, Whitefield, Sarjapur Road, Electronic City',
    price: 'Starting from ,110,000/month',
    priceType: 'Fixed',
    status: 'Active',
    featured: true,
    allowInquiry: true,
    created: '04 May 2026'
  }
];

async function seed() {
  try {
    console.log('Connected to PostgreSQL via Prisma for seeding...');

    await prisma.property.deleteMany({});
    await prisma.service.deleteMany({});
    
    await prisma.property.createMany({ data: INITIAL_PROPERTIES });
    
    for (const service of INITIAL_SERVICES) {
      await prisma.service.create({ data: service });
    }
    
    console.log('Seed successful!');
    process.exit(0);
  } catch (e) {
    console.error('Seed error:', e);
    process.exit(1);
  }
}

seed();
