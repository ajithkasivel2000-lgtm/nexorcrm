/* Runs the HTTP end-to-end suites one after the other (see the header of each).
 *
 * Preconditions this runner checks and shouts about rather than silently
 * passing a stale backend. The suites fire many logins and signups from one
 * IP, so the backend must have DISABLE_RATE_LIMITS=true set or the second
 * half of the suite dies in 429s. Platform-host refusal checks in
 * domains.e2e.js need APP_URL to point at the test platform host. */
const { execFileSync } = require('child_process');
const path = require('path');

const missing = [];
if (!process.env.DISABLE_RATE_LIMITS) missing.push('DISABLE_RATE_LIMITS=true (on the backend process; prevents 429s during the suite)');
if (!process.env.APP_URL)             missing.push('APP_URL=https://os.nexorcrm.test (optional; enables domains.e2e platform-host checks)');
if (missing.length) {
  console.log('⚠  Missing e2e env — some tests will fail or skip:');
  for (const m of missing) console.log('   • ' + m);
  console.log('');
}

let failed = false;
for (const suite of ['tenant.e2e.js', 'features.e2e.js', 'billing.e2e.js', 'reports.e2e.js', 'collections.e2e.js', 'domains.e2e.js', 'companies.e2e.js', 'companylogin.e2e.js', 'companydelete.e2e.js']) {
  console.log(`\n=== ${suite}`);
  try {
    execFileSync(process.execPath, [path.join(__dirname, suite)], { stdio: 'inherit', cwd: path.join(__dirname, '..', '..') });
  } catch {
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
