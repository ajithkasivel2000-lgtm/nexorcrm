/* Runs the HTTP end-to-end suites one after the other (see the header of each). */
const { execFileSync } = require('child_process');
const path = require('path');

let failed = false;
for (const suite of ['tenant.e2e.js', 'features.e2e.js', 'billing.e2e.js', 'reports.e2e.js', 'collections.e2e.js', 'domains.e2e.js', 'companies.e2e.js', 'companylogin.e2e.js']) {
  console.log(`\n=== ${suite}`);
  try {
    execFileSync(process.execPath, [path.join(__dirname, suite)], { stdio: 'inherit', cwd: path.join(__dirname, '..', '..') });
  } catch {
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
