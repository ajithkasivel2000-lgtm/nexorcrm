const prisma = require('./prismaClient');
const userPermissions = [
  { page: 'dashboard',        view: true,  create: false, edit: false, delete: false, export: false },
  { page: 'leads',            view: true,  create: false, edit: true,  delete: false, export: false },
  { page: 'import-leads',     view: false, create: false, edit: false, delete: false, export: false },
  { page: 'opportunities',    view: false, create: false, edit: false, delete: false, export: false },
  { page: 'customers',        view: false, create: false, edit: false, delete: false, export: false },
  { page: 'report',           view: false, create: false, edit: false, delete: false, export: false },
  { page: 'enquiries',        view: false, create: false, edit: false, delete: false, export: false },
  { page: 'projects',         view: false, create: false, edit: false, delete: false, export: false },
  { page: 'channel-partners', view: false, create: false, edit: false, delete: false, export: false },
  { page: 'rrq',              view: false, create: false, edit: false, delete: false, export: false },
  { page: 'user-admin',       view: false, create: false, edit: false, delete: false, export: false },
  { page: 'user-groups',      view: false, create: false, edit: false, delete: false, export: false },
  { page: 'settings',         view: false, create: false, edit: false, delete: false, export: false },
  { page: 'master-lists',     view: false, create: false, edit: false, delete: false, export: false },
];
async function main() {
  const r = await prisma.pageAccess.upsert({
    where: { role: 'User' },
    update: { permissions: userPermissions },
    create: { role: 'User', permissions: userPermissions },
  });
  console.log('User permissions saved:', r.role);
  await prisma['$disconnect']();
}
main().catch(e => { console.error(e); process.exit(1); });
