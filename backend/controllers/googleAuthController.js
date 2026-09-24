/**
 * Sign in with Google.
 *
 * The browser never sees a client secret. Google Identity Services hands the
 * page a signed ID token; this verifies that token server-side against
 * Google's public keys with Google's own library, and only then issues one of
 * our ordinary Session rows. From authMiddleware's point of view a Google
 * login and a password login are indistinguishable — same table, same token
 * shape, same revocation.
 *
 * Two rules do the security work here:
 *
 *   1. Accounts are matched on Google's `sub` claim, not on the email address.
 *      `sub` is stable and never reused; an email address can be changed or,
 *      for a workspace account, handed to a new employee.
 *
 *   2. An email is only ever used to link to an EXISTING row when Google says
 *      it has verified it. Linking on an unverified address would let anyone
 *      who can create a Google account claim a colleague's CRM login.
 */
const { OAuth2Client } = require('google-auth-library');
const prisma = require('../prismaClient');
const { assertSeatAvailable } = require('../utils/billing');
const { sendError } = require('../utils/apiError');
const { auditEvent } = require('../utils/userAudit');
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
const microsoftAuth = require('./microsoftAuthController');

const CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const client = CLIENT_ID ? new OAuth2Client(CLIENT_ID) : null;

/**
 * Who may sign in with Google.
 *
 *   existing — the Google email must already be on a CRM user an admin made.
 *   domain   — as above, plus anyone whose email is on GOOGLE_ALLOWED_DOMAINS.
 *   open     — anyone with a Google account; a CRM user is created for them.
 *
 * 'existing' is the default on purpose: an unset or mistyped variable must
 * fail closed, never fall through to letting the internet in.
 */
const POLICY = (process.env.GOOGLE_SIGNUP_POLICY || 'existing').trim().toLowerCase();

const ALLOWED_DOMAINS = (process.env.GOOGLE_ALLOWED_DOMAINS || '')
  .split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);

/* A newly created account gets the least privilege the app has, never the
   schema's `Manager` default — an account that appears without an
   administrator's involvement must not arrive with authority. */
const NEW_USER_ROLE = (process.env.GOOGLE_NEW_USER_ROLE || 'Employee').trim();

const ipOf = (req) => requestIp(req) || '127.0.0.1';

/** The same refusals the password login applies, so one door is not softer. */
const blockedReason = accountBlockReason;

/**
 * A free username derived from the email's local part.
 *
 * Collisions are real — two people called n.sharma at different domains — so
 * a numeric suffix is added until the name is free rather than letting the
 * unique constraint throw.
 */
async function freeUsername(email) {
  const base = String(email).split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 24) || 'user';
  if (!(await isUsernameTaken(base))) return base;
  for (let n = 2; n < 500; n += 1) {
    const candidate = `${base}${n}`;
    if (!(await isUsernameTaken(candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** What the login page needs to know before it can draw anything. */
/* Which federated sign-ins this server offers, and the public client ids the
   browser needs to start them. Asked before anyone has a token, so it holds
   nothing secret: a client id is sent to every visitor by design. Microsoft is
   reported from its own controller rather than re-read here, so one place
   decides whether a provider is configured. */
exports.providers = async (_req, res) => {
  res.status(200).json({
    google: Boolean(client),
    googleClientId: client ? CLIENT_ID : null,
    microsoft: microsoftAuth.configured(),
    microsoftClientId: microsoftAuth.clientId(),
  });
};

exports.googleSignIn = async (req, res) => {
  try {
    if (!client) {
      return res.status(503).json({
        message: 'Google sign-in is not configured on this server.',
      });
    }

    const credential = req.body?.credential;
    if (!credential) {
      return res.status(400).json({ message: 'No Google credential was supplied.' });
    }

    /* Verifies the signature against Google's published keys, and that the
       token was issued FOR this application — without the audience check a
       token minted for any other site would be accepted here. */
    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: CLIENT_ID });
      payload = ticket.getPayload();
    } catch (verifyError) {
      console.error('Google token rejected:', verifyError.message);
      return res.status(401).json({ message: 'That Google sign-in could not be verified.' });
    }

    const googleId = payload?.sub;
    const email = String(payload?.email || '').trim().toLowerCase();
    if (!googleId || !email) {
      return res.status(401).json({ message: 'Google did not return an account to sign in as.' });
    }
    if (payload.email_verified !== true) {
      return res.status(403).json({
        message: 'That Google account has no verified email address, so it cannot be used to sign in.',
      });
    }

    const ipAddress = ipOf(req);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 255);

    /* ---- 1. the Google account we already know -------------------------- */
    let user = await prisma.user.findUnique({ where: { googleId } });
    let created = false;
    let linked = false;

    /* ---- 2. otherwise, an existing CRM user with this verified email ----- */
    if (!user) {
      const matches = await prisma.user.findMany({
        where: { email: { equals: email, mode: 'insensitive' } },
      });

      if (matches.length > 1) {
        /* Two rows share this address, so there is no way to tell which person
           is signing in. Guessing could hand out the more privileged of the
           two — it refuses and says what to fix. */
        return res.status(409).json({
          message: `More than one NexorCRM account uses ${email}, so Google sign-in cannot tell them apart. `
            + 'Ask an administrator to give each account its own email address.',
        });
      }

      if (matches.length === 1) {
        user = matches[0];
        linked = true;
      }
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
      try { await assertSeatAvailable(company.id, 1); } catch (limitError) {
        return res.status(limitError.status || 402).json({ message: limitError.message, code: 'PLAN_LIMIT' });
      }
      const domain = email.split('@')[1] || '';
      const domainAllowed = ALLOWED_DOMAINS.includes(domain);

      if (POLICY === 'existing' || (POLICY === 'domain' && !domainAllowed)) {
        return res.status(403).json({
          message: 'No NexorCRM account is linked to this Google address. Ask an administrator to create one for you.',
        });
      }
      if (POLICY !== 'open' && POLICY !== 'domain') {
        // An unrecognised policy value fails closed rather than guessing.
        console.error(`Unknown GOOGLE_SIGNUP_POLICY "${POLICY}" — refusing to create an account.`);
        return res.status(403).json({
          message: 'No NexorCRM account is linked to this Google address. Ask an administrator to create one for you.',
        });
      }

      user = await prisma.user.create({
        data: {
          username: await freeUsername(email),
          // firstName is required by the schema; Google may only give a full name.
          firstName: payload.given_name || String(payload.name || email.split('@')[0]).split(' ')[0],
          lastName: payload.family_name || null,
          email,
          // No password at all, rather than a random one: there is nothing to
          // guess, and the reset flow can set one later if they want one.
          password: null,
          status: NEW_USER_ROLE,
          role: NEW_USER_ROLE,
          userlevel: 1,
          profile_image: payload.picture || null,
          googleId,
          googleEmail: email,
          authProvider: 'google',
          registeredIp: ipAddress,
        },
      });
      created = true;
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
        googleId,
        googleEmail: email,
        lastGoogleLoginAt: new Date(),
        lastLoginAt: new Date(),
        lastip: ipAddress,
        user_login_attempts: 0,
        lockedUntil: null,
        ...(user.profile_image ? {} : { profile_image: payload.picture || null }),
      },
    });

    const sessionSetting = await getSessionSettings();
    const expiryDays = sessionSetting.cookieExpiry > 0 ? sessionSetting.cookieExpiry : 14;

    let session;
    try {
      session = await prisma.session.create({
        data: {
          username: user.username,
          ipAddress,
          userAgent,
          persistent: false,
          expiry: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
        },
      });
    } catch (sessionError) {
      console.error('Could not create a session row:', sessionError.message);
      return res.status(500).json({ message: 'Could not start a session. Please try again.' });
    }

    await prisma.systemLog.create({
      data: { username: user.username, event: 'LOGIN', ipAddress },
    }).catch(() => {});

    await auditEvent({
      userId: user.id,
      actor: user.username,
      action: created ? 'ACCOUNT_CREATED_VIA_GOOGLE' : 'LOGIN',
      ip: ipAddress,
      note: created
        ? `Created by Google sign-in as ${email}, role ${NEW_USER_ROLE}`
        : linked
          ? `Google account ${email} linked to this user on first Google sign-in`
          : 'Signed in with Google',
    });

    res.status(200).json({
      message: 'Login successful',
      token: `sess_${session.id}`,
      sessionId: session.id,
      // A Google account has no password to change, so this is never forced.
      mustChangePassword: false,
      createdAccount: created,
      user: {
        id: user.id,
        username: user.username,
        email: user.email || email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
      },
    });
  } catch (error) {
    sendError(res, error, 'Server error during Google sign-in', 500);
  }
};
