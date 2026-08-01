const prisma = require('./prismaClient');

const managerPermissions = [
  { page: 'dashboard',        view: true,  create: true,  edit: true,  delete: true  },
  { page: 'leads',            view: true,  create: true,  edit: true,  delete: true  },
  { page: 'import-leads',     view: false, create: false, edit: false, delete: false },
  { page: 'opportunities',    view: true,  create: true,  edit: true,  delete: true  },
  { page: 'customers',        view: true,  create: true,  edit: true,  delete: true  },
  { page: 'report',           view: false, create: false, edit: false, delete: false },
  { page: 'enquiries',        view: false, create: false, edit: false, delete: false },
  { page: 'projects',         view: true,  create: true,  edit: true,  delete: true  },
  { page: 'properties',       view: false, create: false, edit: false, delete: false },
  { page: 'services',         view: false, create: false, edit: false, delete: false },
  { page: 'channel-partners', view: false, create: false, edit: false, delete: false },
  { page: 'rrq',              view: false, create: false, edit: false, delete: false },
  { page: 'user-admin',       view: false, create: false, edit: false, delete: false },
  { page: 'user-groups',      view: false, create: false, edit: false, delete: false },
  { page: 'settings',         view: false, create: false, edit: false, delete: false },
  { page: 'master-lists',     view: false, create: false, edit: false, delete: false },
];

async function seed() {
  const result = await prisma.pageAccess.upsert({
    where: { role: 'Manager' },
    update: { permissions: managerPermissions },
    create: { role: 'Manager', permissions: managerPermissions },
  });
  console.log('Manager permissions saved:', result.role);
  await prisma.$disconnect();
}

seed().catch(e => { console.error(e); process.exit(1); });
