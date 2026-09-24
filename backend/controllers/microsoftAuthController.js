/**
 * Sign in with Microsoft.
 *
 * The same shape as googleAuthController, deliberately: the browser gets a
 * signed ID token from Microsoft, this verifies it server-side against
 * Microsoft's published keys, and only then issues one of our ordinary
 * Session rows. To authMiddleware a Microsoft login is indistinguishable from
 * a password login — same table, same token, same revocation.
 *
 * Configured for the multi-tenant `common` endpoint, so work, school and
 * personal Microsoft accounts can all sign in. That makes the issuer check the
 * important one: `common` mints tokens for every tenant in the world, so the
 * audience claim — "this token was issued FOR this application" — is what
 * stops a token minted for some other site being replayed here.
 *
 * Three rules do the security work:
 *
 *   1. Accounts are matched on the `oid` claim, not the email. `oid` is the
 *      directory object id: stable for the life of the account, and unlike
 *      `sub` it does not change from one application to another.
 *
 *   2. An email only ever links to an EXISTING row when Microsoft says it is
 *      verified. Personal Microsoft accounts can set an arbitrary display
 *      address, so linking on an unverified one would let anyone claim a
 *      colleague's CRM login.
 *
 *   3. No client secret lives here. The client id is public by design and the
 *      page never holds anything it could forge a login with.
 */
const { createRemoteJWKSet, jwtVerify } = require('jose');
const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { getSessionSettings, requestIp } = require('../utils/settings');
const { accountBlockReason } = require('../middleware/authMiddleware');
const tenant = require('../utils/tenant');
const { isUsernameTaken } = require('../utils/companyAdmin');

/** The company a brand-new SSO account joins: ?company=<slug>, else the original one. */
async function signupCompany(req) {
  const slug = String(req.body?.company || req.query?.company || '').trim().toLowerCase();
  const company = slug
    ? await prisma.company.findUnique({ where: { slug } })
    : await prisma.company.findUnique({ where: { id: tenant.DEFAULT_COMPANY_ID } });
  return company && company.status === 'Active' ? company : null;
}

const CLIENT_ID = (process.env.MICROSOFT_CLIENT_ID || '').trim();

/* Microsoft publishes one key set for the multi-tenant endpoint. jose caches
   the fetch and re-fetches on key rotation, so this is created once. */
const JWKS = CLIENT_ID
  ? createRemoteJWKSet(new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys'))
  : null;

/**
 * Who may sign in with Microsoft. Same three values, and the same default, as
 * the Google policy — an unset or mistyped variable must fail closed.
 *
 *   existing — the Microsoft email must already be on a user an admin made.
 *   domain   — as above, plus anyone on MICROSOFT_ALLOWED_DOMAINS.
 *   open     — anyone with a Microsoft account; a user is created for them.
 */
const POLICY = (process.env.MICROSOFT_SIGNUP_POLICY || 'existing').trim().toLowerCase();

const ALLOWED_DOMAINS = (process.env.MICROSOFT_ALLOWED_DOMAINS || '')
  .split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);

/* The least privilege the app has. An account that appears without an
   administrator's involvement must not arrive with authority. */
const NEW_USER_ROLE = (process.env.MICROSOFT_NEW_USER_ROLE || 'Employee').trim();

const ipOf = (req) => requestIp(req) || '127.0.0.1';

/** The same refusals the password login applies, so one door is not softer. */
const blockedReason = accountBlockReason;

/** A username nobody else holds, derived from the address. */
async function freeUsername(email) {
  const base = String(email).split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 20) || 'user';
  let candidate = base;
  for (let n = 1; n <= 500; n += 1) {
    // eslint-disable-next-line no-await-in-loop
    const taken = await isUsernameTaken(candidate);
    if (!taken) return candidate;
    candidate = `${base}${n}`;
  }
  return `${base}${Date.now()}`;
}

/**
 * Microsoft's `common` endpoint issues tokens whose `iss` carries the signing
 * tenant's id, so the issuer cannot be compared to one fixed string. This
 * accepts only the v2.0 issuer shape, with a tenant id where it belongs.
 */
const ISSUER_RE = /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/v2\.0$/i;

exports.microsoftSignIn = async (req, res) => {
  try {
    if (!JWKS) {
      return res.status(503).json({ message: 'Microsoft sign-in is not configured on this server.' });
    }

    const credential = req.body?.credential;
    if (!credential) {
      return res.status(400).json({ message: 'No Microsoft credential was supplied.' });
    }

    /* Verifies the signature against Microsoft's published keys AND that the
       token was minted for this application. Without the audience check, a
       token issued for any other Microsoft app would be accepted here. */
    let payload;
    try {
      const verified = await jwtVerify(credential, JWKS, { audience: CLIENT_ID });
      payload = verified.payload;
      if (!ISSUER_RE.test(String(payload.iss || ''))) {
        throw new Error(`unexpected issuer ${payload.iss}`);
      }
    } catch (verifyError) {
      console.error('Microsoft token rejected:', verifyError.message);
      return res.status(401).json({ message: 'That Microsoft sign-in could not be verified.' });
    }

    const microsoftId = payload.oid || payload.sub;
    /* Work and school accounts put the address in `preferred_username`;
       personal accounts use `email`. Either way it is lowercased, because
       addresses are case-insensitive and two casings must not become two
       accounts. */
    const email = String(payload.email || payload.preferred_username || '').trim().toLowerCase();

    if (!microsoftId || !email || !email.includes('@')) {
      return res.status(401).json({ message: 'Microsoft did not return an account to sign in as.' });
    }

    /* `xms_edov` is Microsoft's "email domain owner verified" claim. Absent, a
       work account whose domain the tenant has verified is still trustworthy;
       a personal account's self-set address is not. Consumer tokens carry the
       consumer tenant id, which is what distinguishes them. */
    const CONSUMER_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';
    const isConsumer = String(payload.tid || '') === CONSUMER_TENANT;
    const domainVerified = payload.xms_edov === true || payload.xms_edov === '1' || !isConsumer;

    const ipAddress = ipOf(req);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 255);

    /* ---- 1. the Microsoft account we already know ------------------------ */
    let user = await prisma.user.findUnique({ where: { microsoftId } });

    /* ---- 2. otherwise, an existing user with this verified email --------- */
    if (!user && domainVerified) {
      const matches = await prisma.user.findMany({
        where: { email: { equals: email, mode: 'insensitive' } },
      });
      if (matches.length > 1) {
        /* Two rows share this address, so there is no way to tell which person
           is signing in. Guessing could hand out the more privileged of the
           two — refuse, and say what to fix. */
        return res.status(409).json({
          message: `More than one NexorCRM account uses ${email}, so Microsoft sign-in cannot tell them apart. `
            + 'Ask an administrator to give each account its own email address.',
        });
      }
      if (matches.length === 1) user = matches[0];
    }

    // A known account: the rest of the sign-in belongs to its company.
    if (user) tenant.adopt(user.companyId);

    /* ---- 3. nobody yet: may we make one? -------------------------------- */
    if (!user) {
      const company = await signupCompany(req);
      if (!company) {
        return res.status(404).json({ message: 'That company was not found.' });
      }
      tenant.adopt(company.id);
      const domain = email.split('@')[1] || '';
      const domainAllowed = ALLOWED_DOMAINS.includes(domain);
      const mayCreate = domainVerified
        && (POLICY === 'open' || (POLICY === 'domain' && domainAllowed));

      if (!mayCreate) {
        return res.status(403).json({
          message: 'No NexorCRM account is linked to this Microsoft address. Ask an administrator to create one for you.',
        });
      }

      user = await prisma.user.create({
        data: {
          username: await freeUsername(email),
          // firstName is required by the schema; Microsoft may only give a full name.
          firstName: payload.given_name || String(payload.name || email.split('@')[0]).split(' ')[0],
          lastName: payload.family_name || null,
          email,
          // No password at all, rather than a random one: there is nothing to
          // guess, and the reset flow can set one later if they want one.
          password: null,
          status: NEW_USER_ROLE,
          role: NEW_USER_ROLE,
          userlevel: 1,
          microsoftId,
          microsoftEmail: email,
          authProvider: 'microsoft',
          registeredIp: ipAddress,
        },
      });
    }

    /* ---- 4. the same gates the password login applies -------------------- */
    const blocked = blockedReason(user);
    if (blocked) {
      await prisma.systemLog.create({
        data: { username: user.username, event: 'LOGIN_FAILED', ipAddress },
      }).catch(() => {});
      return res.status(403).json({ message: blocked });
    }

    /* ---- 5. record the link and the login -------------------------------- */
    await prisma.user.update({
      where: { id: user.id },
      data: {
        microsoftId,
        microsoftEmail: email,
        lastMicrosoftLoginAt: new Date(),
        lastLoginAt: new Date(),
        lastip: ipAddress,
        user_login_attempts: 0,
        lockedUntil: null,
      },
    });

    const sessionSetting = await getSessionSettings();
    const expiryDays = sessionSetting.cookieExpiry > 0 ? sessionSetting.cookieExpiry : 14;

    const session = await prisma.session.create({
      data: {
        username: user.username,
        ipAddress,
        userAgent,
        persistent: false,
        expiry: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
      },
    }).catch(() => null);

    if (!session) {
      return res.status(500).json({ message: 'Could not start a session. Please try again.' });
    }

    await prisma.systemLog.create({
      data: { username: user.username, event: 'LOGIN', ipAddress },
    }).catch(() => {});

    return res.status(200).json({
      message: 'Login successful',
      token: `sess_${session.id}`,
      sessionId: session.id,
      user: { username: user.username, status: user.status },
    });
  } catch (error) {
    return sendError(res, error, 'Microsoft sign-in failed', 500);
  }
};

/** Whether this server offers Microsoft sign-in, for /api/auth/providers. */
exports.configured = () => Boolean(JWKS);
exports.clientId = () => (JWKS ? CLIENT_ID : null);
