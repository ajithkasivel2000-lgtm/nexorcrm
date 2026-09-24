/**
 * Put a Google or Microsoft client id into backend/.env, correctly.
 *
 *   npm run setup:google    -- 1234-abc.apps.googleusercontent.com
 *   npm run setup:microsoft -- 11111111-2222-3333-4444-555555555555
 *
 * Hand-editing works too, but three things catch people out here and all of
 * them look like "sign-in is broken" rather than "it is not configured":
 *
 *   - GOOGLE_CLIENT_ID ships commented out, next to a placeholder value. Set
 *     the value but leave the # in place and dotenv never sees it.
 *   - A commented copy further down can be mistaken for the live one.
 *   - A client id of the right SHAPE but the wrong value is the worst case:
 *     the server reports the provider as configured, the tile lights up, and
 *     the only complaint arrives on the vendor's own error page — "Access
 *     blocked: the OAuth client was not found" — which reads as this app
 *     being broken. Google can be asked about an id before it is written, so
 *     it is. Microsoft cannot; see its entry below.
 */
const fs = require('fs');
const https = require('https');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '.env');

/**
 * Ask Google whether it has ever heard of this client id.
 *
 * Google answers a bad one with a 302 to /signin/oauth/error and puts the
 * reason in an authError query parameter — base64, which is why grepping the
 * response body for the words "invalid_client" finds nothing. The redirect
 * target is the signal; decoding that parameter turns it into a sentence worth
 * printing.
 *
 * Resolves { ok, detail }. A network failure resolves ok:true — being offline
 * is not evidence the id is wrong, and refusing to configure would be worse
 * than configuring something unchecked.
 */
function googleKnows(clientId) {
  const url = 'https://accounts.google.com/o/oauth2/v2/auth'
    + `?client_id=${encodeURIComponent(clientId)}`
    + '&redirect_uri=http%3A%2F%2Flocalhost%3A5173&response_type=code&scope=openid';

  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 8000 }, (res) => {
      res.resume();   // drain, so the socket closes
      const location = res.headers.location || '';
      if (!/\/signin\/oauth\/error/.test(location)) { resolve({ ok: true }); return; }

      let reason = 'the client id was rejected';
      const raw = /[?&]authError=([^&]+)/.exec(location);
      if (raw) {
        try {
          reason = Buffer.from(decodeURIComponent(raw[1]), 'base64')
            .toString('utf8')
            .replace(/[^\x20-\x7e]+/g, ' ')
            .trim();
        } catch { /* keep the generic reason */ }
      }
      resolve({ ok: false, detail: reason });
    });
    req.on('error', () => resolve({ ok: true, detail: 'unreachable' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: true, detail: 'timeout' }); });
  });
}

const PROVIDERS = {
  google: {
    key: 'GOOGLE_CLIENT_ID',
    label: 'Google',
    looksRight: (v) => v.endsWith('.apps.googleusercontent.com') && !v.startsWith('xxx'),
    shape: 'something like 123456789012-abc123.apps.googleusercontent.com',
    where: 'https://console.cloud.google.com/apis/credentials -> Create OAuth client ID -> Web application',
    check: googleKnows,
  },
  microsoft: {
    key: 'MICROSOFT_CLIENT_ID',
    label: 'Microsoft',
    looksRight: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
    shape: 'a GUID, like 11111111-2222-3333-4444-555555555555',
    where: 'https://portal.azure.com -> Microsoft Entra ID -> App registrations -> New registration',
    /* Not checkable before the fact. Microsoft answers its authorize endpoint
       with an ordinary 200 sign-in page whatever the client id is; the
       AADSTS700016 "not found in the directory" error appears only once that
       page's own scripts run. So the format check is all there is, and the
       script says so rather than implying it verified anything. */
    check: () => Promise.resolve({ ok: true, detail: 'unverifiable' }),
  },
};

const provider = (process.argv[2] || '').toLowerCase();
const value = (process.argv[3] || '').trim();
const spec = PROVIDERS[provider];

if (!spec) {
  console.error('Usage: node scripts/setProvider.js <google|microsoft> <client-id>');
  process.exit(1);
}
if (!value) {
  console.error(`No client id given.\n\nGet one at:\n  ${spec.where}\n\nIt looks like ${spec.shape}.`);
  process.exit(1);
}
if (!spec.looksRight(value)) {
  console.error(`That does not look like a ${provider} client id — expected ${spec.shape}.`);
  console.error('Nothing was written. Re-run with the real value, or edit .env by hand.');
  process.exit(1);
}
if (!fs.existsSync(ENV_PATH)) {
  console.error(`No .env at ${ENV_PATH}. Copy .env.example to .env first.`);
  process.exit(1);
}

async function main() {
  const known = await spec.check(value);

  if (!known.ok) {
    console.error(`${spec.key} was NOT written.`);
    console.error('');
    console.error(`${spec.label} says: ${known.detail}`);
    console.error('');
    console.error('Check you copied the whole value from:');
    console.error(`  ${spec.where}`);
    process.exit(1);
  }

  if (known.detail === 'unverifiable') {
    console.warn(`Note: ${spec.label} cannot be asked whether a client id exists before it is`);
    console.warn('used, so this was written after a format check only. If sign-in then fails');
    console.warn('with "AADSTS700016", the id is wrong or the registration is in another tenant.');
    console.warn('');
  } else if (known.detail) {
    console.warn(`Could not reach ${spec.label} to check the id (${known.detail}) — writing it unchecked.`);
    console.warn('');
  }

  const original = fs.readFileSync(ENV_PATH, 'utf8');
  const eol = original.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
  const lines = original.split(/\r?\n/);

  // Any line setting this key, live or commented out.
  const pattern = new RegExp(`^\\s*#?\\s*${spec.key}\\s*=`);
  const matches = lines
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => pattern.test(line));

  let action;
  if (matches.length === 0) {
    lines.push(`${spec.key}=${value}`);
    action = 'added';
  } else {
    // The first occurrence becomes the live one; any others are left commented
    // out, so two lines can never disagree about the value.
    matches.forEach(({ i }, n) => {
      if (n === 0) {
        lines[i] = `${spec.key}=${value}`;
      } else if (!/^\s*#/.test(lines[i])) {
        lines[i] = `# ${lines[i].trim()}`;
      }
    });
    action = matches.length > 1 ? 'replaced (and commented out a duplicate)' : 'replaced';
  }

  fs.writeFileSync(ENV_PATH, lines.join(eol));

  const confirmed = !known.detail;
  console.log(`${spec.key} ${action} in backend/.env${confirmed ? ` — and ${spec.label} recognises it.` : '.'}`);
  console.log('');
  console.log('Next:');
  console.log('  1. Make sure the app allows http://localhost:5173 as an origin / redirect URI.');
  console.log('  2. The backend restarts on its own (nodemon watches .env).');
  console.log('  3. Reload the login page — the tile stops being dimmed.');
}

main().catch((err) => { console.error(err.message); process.exit(1); });
