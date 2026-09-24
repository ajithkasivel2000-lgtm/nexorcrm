/**
 * Scenario tests for per-user permissions.
 *
 *   node scripts/testUserPermissions.js
 */

const prisma = require('../prismaClient');
const {
  can, permissionsFor, flatPermissionsFor, setPermission, clearPermission,
  clearAll, requirePermission, invalidate,
} = require('../utils/permissions');
const { PAGES, actionsFor, isPage } = require('../utils/pages');

const TAG = `PERM${Date.now().toString(36)}`;
const results = [];
let failures = 0;

function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  if (!passed) failures += 1;
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

/** Runs a guard and reports what the request would have received. */
const runGuard = (mw, user) => new Promise((resolve) => {
  const res = {
    code: 0,
    status(c) { this.code = c; return this; },
    json(d) { resolve({ code: this.code, body: d }); return this; },
  };
  mw({ user }, res, () => resolve({ code: 200, body: 'allowed' }));
});

async function main() {
  console.log(`\nPer-user permissions  (tag ${TAG})\n${'='.repeat(58)}`);

  const user = await prisma.user.create({
    data: { username: `${TAG}_u`, firstName: 'T', password: 'x', status: 'Employee', email: `${TAG}@test.local` },
  });
  const superAdmin = await prisma.user.findFirst({ where: { username: 'admin' } });

  try {
    /* ---- 1. a user with no rows is unrestricted ------------------------- */
    console.log('\n1. A user with no permissions set is unrestricted');
    invalidate();
    check('projects.view allowed', await can(user, 'projects', 'view'));
    check('projects.delete allowed', await can(user, 'projects', 'delete'));
    const before = await permissionsFor(user);
    check('reported as not restricted', before.restricted === false);

    /* ---- 2. the example from the request -------------------------------- */
    console.log('\n2. Grant projects: view + create + edit, but NOT delete/export');
    await setPermission(user.id, 'projects', {
      view: true, create: true, edit: true, delete: false, export: false,
    }, 'admin');
    check('view', await can(user, 'projects', 'view') === true);
    check('create', await can(user, 'projects', 'create') === true);
    check('edit', await can(user, 'projects', 'edit') === true);
    check('delete refused', await can(user, 'projects', 'delete') === false);
    check('export refused', await can(user, 'projects', 'export') === false);

    /* ---- 3. having one row closes the other pages ----------------------- */
    console.log('\n3. Once any page is configured, unlisted pages are closed');
    check('leads.view now refused', await can(user, 'leads', 'view') === false,
      'no row for leads');
    check('reported as restricted', (await permissionsFor(user)).restricted === true);

    /* ---- 4. grant a second page ----------------------------------------- */
    console.log('\n4. Granting leads does not disturb projects');
    await setPermission(user.id, 'leads', { view: true, export: true }, 'admin');
    check('leads.view', await can(user, 'leads', 'view') === true);
    check('leads.export', await can(user, 'leads', 'export') === true);
    check('leads.edit refused', await can(user, 'leads', 'edit') === false);
    check('projects.edit still allowed', await can(user, 'projects', 'edit') === true);

    /* ---- 5. revoking ----------------------------------------------------- */
    console.log('\n5. Saving a page with everything off closes it');
    await setPermission(user.id, 'projects', {
      view: false, create: false, edit: false, delete: false, export: false,
    }, 'admin');
    check('projects.view refused', await can(user, 'projects', 'view') === false);
    const row = await prisma.userPermission.findFirst({ where: { userId: user.id, page: 'projects' } });
    check('the row still exists (explicit denial)', !!row, 'not the same as having no row');

    /* ---- 6. clearing one page ------------------------------------------- */
    console.log('\n6. Clearing a page removes its row');
    await clearPermission(user.id, 'projects');
    check('row gone', !(await prisma.userPermission.findFirst({ where: { userId: user.id, page: 'projects' } })));
    check('still closed, because other rows exist', await can(user, 'projects', 'view') === false);

    /* ---- 7. clearing everything restores unrestricted -------------------- */
    console.log('\n7. Clearing every row makes the user unrestricted again');
    const cleared = await clearAll(user.id);
    check('rows removed', cleared > 0, `${cleared}`);
    check('projects.view allowed again', await can(user, 'projects', 'view') === true);
    check('reported as not restricted', (await permissionsFor(user)).restricted === false);

    /* ---- 8. the server-side guard ---------------------------------------- */
    console.log('\n8. The route guard agrees with can()');
    await setPermission(user.id, 'projects', { view: true, edit: false }, 'admin');
    const editGuard = requirePermission('projects', 'edit');
    const viewGuard = requirePermission('projects', 'view');
    let r = await runGuard(viewGuard, user);
    check('view passes', r.code === 200, `${r.code}`);
    r = await runGuard(editGuard, user);
    check('edit refused with 403', r.code === 403, `${r.code}`);
    check('and says why', /permission to edit projects/.test(r.body?.message || ''), r.body?.message);
    r = await runGuard(editGuard, null);
    check('unauthenticated gets 401', r.code === 401);

    /* ---- 9. the super admin is never gated ------------------------------- */
    console.log('\n9. The super admin is never restricted');
    check('admin passes the guard', (await runGuard(editGuard, superAdmin)).code === 200);
    check('can() agrees', await can(superAdmin, 'projects', 'delete') === true);
    let refused = false;
    try { await setPermission(superAdmin.id, 'projects', { view: false }); } catch { refused = true; }
    // setPermission itself does not refuse; the controller does. Just record it.
    check('permissions are meaningless for them either way',
      await can(superAdmin, 'projects', 'view') === true, refused ? 'write refused' : 'write ignored');
    await clearAll(superAdmin.id);

    /* ---- 10. the flat shape the UI gates on ------------------------------ */
    console.log('\n10. The /me shape the front end uses');
    const flat = await flatPermissionsFor(user);
    check('restricted flag present', flat.restricted === true);
    check('permissions is an array', Array.isArray(flat.permissions));
    const proj = flat.permissions.find((p) => p.page === 'projects');
    check('projects row has all five actions', proj
      && ['view', 'create', 'edit', 'delete', 'export'].every((a) => a in proj), JSON.stringify(proj));

    /* ---- 11. validation --------------------------------------------------- */
    console.log('\n11. Validation');
    let bad = false;
    try { await setPermission(user.id, 'not-a-page', { view: true }); } catch { bad = true; }
    check('an unknown page is refused', bad);
    check('isPage agrees', isPage('projects') && !isPage('not-a-page'));
    check('report has no create action', !actionsFor('report').includes('create'),
      actionsFor('report').join(', '));
    await setPermission(user.id, 'report', { view: true, create: true, export: true }, 'admin');
    check('an unsupported action cannot be granted', await can(user, 'report', 'create') === false,
      'create is not offered on report');
    check('a supported one still can', await can(user, 'report', 'export') === true);

    /* ---- 12. every page in the catalogue is real -------------------------- */
    console.log('\n12. The catalogue');
    check(`${PAGES.length} pages defined`, PAGES.length > 0);
    check('every page has an id, label and group',
      PAGES.every((p) => p.id && p.label && p.group));
    check('no duplicate ids', new Set(PAGES.map((p) => p.id)).size === PAGES.length);
  } finally {
    console.log('\nCleaning up…');
    await prisma.userPermission.deleteMany({ where: { userId: user.id } }).catch(() => { });
    await prisma.userAuditLog?.deleteMany?.({ where: { userId: user.id } }).catch(() => { });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => { });
  }

  console.log(`\n${'='.repeat(58)}`);
  console.log(`${results.length - failures}/${results.length} checks passed`);
  if (failures) {
    console.log('\nFailed:');
    results.filter((r) => !r.passed).forEach((r) => console.log(`  - ${r.name} ${r.detail}`));
  }
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error('\nTest run failed:', error);
  process.exit(1);
});
