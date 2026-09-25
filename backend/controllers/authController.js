const prisma = require('../prismaClient');
const { assertSeatAvailable } = require('../utils/billing');
const { applyRoleDefaults } = require('../utils/permissions');
const { sendError } = require('../utils/apiError');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendMail } = require('../utils/mailer');
const { auditEvent } = require('../utils/userAudit');
const {
  getSessionSettings, getGlobalUserSettings, getRegistrationSettings,
  publicRegistrationRules, allowedUsernameChars,
  isBannedIp, isDisallowedUsername, requestIp, homePageFor, sweepSessions,
  getSecuritySettings,
} = require('../utils/settings');
const { accountBlockReason } = require('../middleware/authMiddleware');
const tenant = require('../utils/tenant');
const { isUsernameTaken } = require('../utils/companyAdmin');
const {
  newSecret, verifyCode, otpauthUri, newRecoveryCodes, consumeRecoveryCode, signChallenge, readChallenge,
} = require('../utils/totp');

/* Lockout policy. user_login_attempts has been on the User row since the
   original schema but was never written to; these are the thresholds that
   make it real. Five consecutive failures from ONE source address lock the
   account for fifteen minutes — the targeted-guessing case. Counting per
   address (utils/loginAttempts.js) is what stops the spray: an attacker with
   a list of usernames sending one wrong password to each, from a different
   IP per request, used to be able to lock every account in the company at
   once. A distributed spray never reaches five on any one account from any
   one address, and the per-IP login rate limit still caps each machine. */
const LOCK_MINUTES = 15;
const { MAX_LOGIN_ATTEMPTS, recordLoginFailure, resetLoginFailures } = require('../utils/loginAttempts');

/* Password reset tokens are stored in the database, hashed (SHA-256) — a
   database dump must not hand out working reset links, any more than it
   should hand out passwords. Rows are single-use, expire after 30 minutes,
   and are swept on every request, so the table stays small. A restart no
   longer cancels pending resets, and the flow survives more than one
   server instance, which an in-memory Map silently broke. */
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * Where links in emails point.
 *
 * APP_URL (e.g. https://os.nexorcrm.com) in production. The request's Origin
 * and Host headers are chosen by whoever sends the request, so building links
 * from them let anyone ask for a reset of someone else's password and have the
 * genuine email carry a working token to a site they control. Development
 * falls back to the request, since there is no one else to fool there.
 */
async function appUrl(req, user) {
  // A company on its own domain (crm.roofonwalls.com) gets links to that
  // domain. It comes from the company record, which only the platform owner
  // sets, never from the request.
  if (user?.companyId) {
    const own = await require('../utils/companyUrl').companyBaseUrl(user.companyId);
    if (own && own.startsWith('https://')) return own;
  }
  const configured = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') return null;
  return req.headers.origin || `${req.protocol}://${req.get('host')}`;
}

/** User-typed names go into email HTML; escape them so a name cannot inject markup. */
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/* Same password rules as userController so a reset password is as strong as
   one set during account creation. */
const validatePassword = (password) => {
  if (!password) return 'Password is required.';
  if (password.length < 10) return 'Password must be at least 10 characters.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return 'Password must contain at least one special character.';
  return null;
};

/* A bcrypt digest is 60 chars and starts with $2a$ / $2b$ / $2y$.
   Anything else is a legacy plain-text password that predates hashing. */
const isBcryptHash = (value) =>
  typeof value === 'string' &&
  value.length === 60 &&
  ['$2a$', '$2b$', '$2y$'].some((prefix) => value.startsWith(prefix));

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    /* Find the account by username OR email.
     *
     * The login field has said "Username / Email" for as long as it has
     * existed, but the lookup was findUnique on username alone, so an email
     * address — the thing most people reach for first, and the only identifier
     * a Google-created account is known by — answered "Invalid credentials".
     *
     * Email is matched case-insensitively because addresses are; usernames
     * stay exact, since that is how they are stored and compared everywhere
     * else. Username is tried first so an account whose username happens to
     * look like someone else's email cannot shadow it. */
    const typed = String(username).trim();

    /* A company's own sign-in (its domain, its ?company= link, or the Company
       Login tab) lets only that company's people in. Someone from another
       company is answered exactly like a wrong password, so the page does not
       confirm which usernames exist elsewhere. */
    const scope = await require('../utils/companyUrl').loginCompany(req);
    if (scope.error) return res.status(400).json({ message: scope.error });
    const inScope = (u) => !u || !scope.company || u.companyId === scope.company.id;

    let user = await prisma.user.findUnique({ where: { username: typed } });
    if (!inScope(user)) user = null;
    if (!user && typed.includes('@')) {
      /* An email address can belong to accounts in more than one company; the
         username is what tells them apart, so an ambiguous email is refused
         rather than guessed at. On a company's own sign-in only its accounts
         are considered. */
      const byEmail = await prisma.user.findMany({
        where: { email: { equals: typed, mode: 'insensitive' }, ...(scope.company ? { companyId: scope.company.id } : {}) },
        take: 2,
      });
      if (byEmail.length > 1) {
        return res.status(400).json({ message: 'More than one account uses this email. Sign in with your username.' });
      }
      user = byEmail[0] || null;
    }

    /* From here on this request belongs to the account's company: its IP ban
       list, its session rules, and every row written below. The ban answers
       exactly like a wrong password — telling a blocked address it is blocked
       only helps whoever set the ban test it. */
    if (user) {
      tenant.adopt(user.companyId);
      if (isBannedIp(req, await getSecuritySettings())) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      // Housekeeping, not the guard — verifySession is what refuses dead rows.
      sweepSessions();
    }
    
    // Bootstrap fallback: a brand-new deployment has no users, so the first
    // company's admin cannot be created through the UI or seeded yet. It used
    // to be a well-known password ("password123") on an empty database — any
    // window before first setup let a stranger take the platform over.
    //
    // Now it demands SETUP_TOKEN: a value the operator generates, keeps in the
    // server's environment, and sends in the login body. Nobody without read
    // access to the environment can pass, and the guessable part is gone.
    if (!user) {
      const userCount = await prisma.user.count();
      const setupToken = String(process.env.SETUP_TOKEN || '').trim();
      const presented = String(req.body.setupToken || '').trim();
      const tokenOk = setupToken.length >= 16
        && presented.length === setupToken.length
        && crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(setupToken));
      if (userCount === 0 && tokenOk) {
        // A brand-new platform: the bootstrap admin belongs to the first company.
        tenant.adopt(tenant.DEFAULT_COMPANY_ID);
        const ipAddress = requestIp(req) || '127.0.0.1';
        await prisma.systemLog.create({
          data: { username: 'admin', event: 'LOGIN', ipAddress }
        }).catch(() => {});
        // A one-off bootstrap marker, so first setup is visible in the log.
        await prisma.systemLog.create({
          data: { username: 'admin', event: 'BOOTSTRAP_LOGIN', ipAddress }
        }).catch(() => {});
        // The bootstrap admin gets a real session row like anyone else — its
        // id is the token, and authMiddleware verifies it the same way.
        const session = await prisma.session.create({
          data: {
            username: 'admin',
            ipAddress,
            userAgent: String(req.headers['user-agent'] || '').slice(0, 255),
            persistent: false,
            expiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        }).catch(() => null);
        if (!session) {
          return res.status(500).json({ message: 'Could not start a session. Please try again.' });
        }
        return res.status(200).json({
          message: 'Login successful (bootstrap)',
          token: `sess_${session.id}`,
          sessionId: session.id,
          mustChangePassword: true,
          user: { username: 'admin', status: 'Admin' },
        });
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Banned, suspended, archived, awaiting activation, or locked: no sign-in,
    // whatever the password says. The same rule every other door applies.
    const blocked = accountBlockReason(user);
    if (blocked) {
      return res.status(403).json({ message: blocked });
    }

    const ipAddress = requestIp(req) || '127.0.0.1';
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 255);

    // Existing rows store the password in plain text. bcrypt.compare() always
    // fails against a non-hash, which locked every account out, so verify by
    // format and upgrade the row to a real hash on the next successful login.
    let passwordMatch = false;
    let upgradePasswordHash = false;
    if (user.password) {
      if (isBcryptHash(user.password)) {
        passwordMatch = await bcrypt.compare(password, user.password);
      } else {
        passwordMatch = password === user.password;
        upgradePasswordHash = passwordMatch;
      }
    }
    if (!passwordMatch) {
      // The failure counts against this account FROM THIS ADDRESS. At the
      // threshold, lock the account — that is a targeted attack, not noise.
      const attempts = recordLoginFailure(user.id, ipAddress);
      const lockedUntil = attempts >= MAX_LOGIN_ATTEMPTS
        ? new Date(Date.now() + LOCK_MINUTES * 60000)
        : null;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastFailedLoginAt: new Date(),
          lastFailedLoginIp: ipAddress,
          // The row's counter mirrors the per-address streak so the sessions
          // tab and dashboards keep working; the lock decision is the
          // tracker's. When the account locks, stop counting from anywhere:
          // the next attempt after expiry starts clean.
          user_login_attempts: lockedUntil ? 0 : attempts,
          lockedUntil,
        },
      });
      await prisma.systemLog.create({
        data: { username: user.username, event: 'LOGIN_FAILED', ipAddress }
      }).catch(() => {});
      await auditEvent({
        userId: user.id,
        actor: user.username,
        action: 'LOGIN_FAILED',
        ip: ipAddress,
        note: lockedUntil ? `Account locked after ${MAX_LOGIN_ATTEMPTS} failures from one address` : `Attempt ${attempts} of ${MAX_LOGIN_ATTEMPTS} from this address`,
      });
      return res.status(401).json({ message: lockedUntil
        ? `Invalid credentials. Account locked for ${LOCK_MINUTES} minutes after ${MAX_LOGIN_ATTEMPTS} failed attempts.`
        : 'Invalid credentials' });
    }

    // A correct password clears this account's per-address failure streaks.
    resetLoginFailures(user.id);

    // Two-factor accounts stop here: no session until the code is checked.
    if (user.totpEnabled && user.totpSecret) {
      if (upgradePasswordHash) {
        await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(password, 10) } });
      }
      return res.status(200).json({
        twoFactorRequired: true,
        challenge: signChallenge(user.id, { r: req.body.rememberMe === true }),
        message: 'Enter the 6-digit code from your authenticator app.',
      });
    }

    return completeLogin(req, res, user, {
      ipAddress,
      userAgent,
      persistent: req.body.rememberMe === true,
      newPasswordHash: upgradePasswordHash ? await bcrypt.hash(password, 10) : null,
    });
  } catch (error) {
    sendError(res, error, 'Server error during login', 500);
  }
};

/**
 * The last step of every successful sign-in — password, or password plus
 * two-factor code: clear the failure counter, apply the single-login rule,
 * open the session and answer with the token.
 */
async function completeLogin(req, res, user, { ipAddress, userAgent, persistent, newPasswordHash = null }) {
  try {
    // Update last login, hashing the legacy password while we have the plain
    // text in hand. A successful login clears the failure counter and any
    // expired lock.
    resetLoginFailures(user.id);
    const loginData = {
      lastLoginAt: new Date(),
      user_login_attempts: 0,
      lockedUntil: null,
      lastip: ipAddress,
    };
    if (newPasswordHash) loginData.password = newPasswordHash;
    await prisma.user.update({
      where: { id: user.id },
      data: loginData
    });

    /* Multiple logins on one account are a session setting, not a permanent
       law. With it off, every older live session is closed when a new one
       signs in — the newest login wins, which is the behaviour the settings
       page describes. */
    const userSettings = await getGlobalUserSettings();
    if (userSettings.allowMultipleLogins === false) {
      await prisma.session.deleteMany({ where: { username: user.username } }).catch(() => {});
    }

    /* A session row per login, and its id IS the token. The row must be
       created for the login to succeed: handing out a dummy token here used to
       sign the user in to a UI that could never pass an authenticated request,
       because authMiddleware now verifies the token against this table.
       Expiry comes from SessionSetting.cookieExpiry; remember-me sessions live
       that long and ordinary ones last a day. */
    const sessionSetting = await getSessionSettings();
    const expiryDays = sessionSetting.cookieExpiry > 0 ? sessionSetting.cookieExpiry : 14;
    const sessionTtlMs = (persistent ? expiryDays : 1) * 24 * 60 * 60 * 1000;
    let session;
    try {
      session = await prisma.session.create({
        data: {
          username: user.username,
          ipAddress,
          userAgent,
          persistent,
          expiry: new Date(Date.now() + sessionTtlMs),
        },
      });
    } catch (sessionError) {
      console.error('Could not create a session row:', sessionError.message);
      return res.status(500).json({ message: 'Could not start a session. Please try again.' });
    }

    await prisma.systemLog.create({
      data: { username: user.username, event: 'LOGIN', ipAddress }
    });
    await auditEvent({ userId: user.id, actor: user.username, action: 'LOGIN', ip: ipAddress });

    res.status(200).json({
      message: 'Login successful',
      token: `sess_${session.id}`,
      sessionId: session.id,
      mustChangePassword: Boolean(user.forcePasswordChange),
      // From GlobalUserSetting: where this account should land, when the
      // individual-homepages feature is switched on and applies to them.
      homePage: await homePageFor(user),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status
      }
    });
  } catch (error) {
    sendError(res, error, 'Server error during login', 500);
  }
}

/**
 * POST /api/auth/2fa/verify { challenge, code }
 *
 * The second half of a two-factor login. `code` is the authenticator's six
 * digits or one of the recovery codes (each works once). Wrong codes count
 * towards the same lockout as wrong passwords.
 */
exports.verifyTwoFactor = async (req, res) => {
  try {
    const data = readChallenge(req.body?.challenge);
    if (!data) return res.status(401).json({ message: 'That sign-in has expired. Please enter your password again.' });
    const user = await prisma.user.findUnique({ where: { id: data.u } });
    if (!user || !user.totpEnabled) return res.status(401).json({ message: 'That sign-in has expired. Please enter your password again.' });
    tenant.adopt(user.companyId);

    const blocked = accountBlockReason(user);
    if (blocked) return res.status(403).json({ message: blocked });

    const ipAddress = requestIp(req) || '127.0.0.1';
    const code = String(req.body?.code || '').trim();
    let ok = verifyCode(user.totpSecret, code);
    if (!ok) {
      const remaining = consumeRecoveryCode(user.totpRecoveryCodes, code);
      if (remaining) {
        ok = true;
        await prisma.user.update({ where: { id: user.id }, data: { totpRecoveryCodes: remaining } });
        await auditEvent({ userId: user.id, actor: user.username, action: 'RECOVERY_CODE_USED', ip: ipAddress, note: `${remaining.length} recovery code(s) left` });
      }
    }
    if (!ok) {
      // Same per-address rule as the password step: one source must produce
      // the whole streak before the account locks, so a code-spraying attack
      // across addresses cannot lock people out.
      const attempts = recordLoginFailure(user.id, ipAddress);
      const lockedUntil = attempts >= MAX_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60000) : null;
      await prisma.user.update({
        where: { id: user.id },
        data: { user_login_attempts: lockedUntil ? 0 : attempts, lockedUntil, lastFailedLoginAt: new Date(), lastFailedLoginIp: ipAddress },
      });
      await auditEvent({ userId: user.id, actor: user.username, action: 'LOGIN_FAILED', ip: ipAddress, note: 'Wrong two-factor code' });
      return res.status(401).json({ message: lockedUntil
        ? `Wrong code. Account locked for ${LOCK_MINUTES} minutes.`
        : 'That code is not right. Check the time on your phone and try again.' });
    }

    resetLoginFailures(user.id);
    return completeLogin(req, res, user, {
      ipAddress,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 255),
      persistent: data.r === true,
    });
  } catch (error) {
    sendError(res, error, 'Could not complete the sign-in', 500);
  }
};

/** POST /api/auth/2fa/setup — a new secret to scan; not active until confirmed. */
exports.setupTwoFactor = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (user.totpEnabled) return res.status(400).json({ message: 'Two-factor sign-in is already on. Turn it off first to set it up again.' });
    const secret = newSecret();
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret } });
    res.status(200).json({ secret, otpauthUri: otpauthUri(secret, user.email || user.username) });
  } catch (error) {
    sendError(res, error, 'Could not start two-factor setup', 500);
  }
};

/** POST /api/auth/2fa/enable { code } — confirm the app works, switch it on. */
exports.enableTwoFactor = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user.totpSecret) return res.status(400).json({ message: 'Start the setup first.' });
    if (!verifyCode(user.totpSecret, req.body?.code)) {
      return res.status(400).json({ message: 'That code is not right. Check the time on your phone and try again.' });
    }
    const { plain, hashed } = newRecoveryCodes();
    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true, totpRecoveryCodes: hashed } });
    await auditEvent({ userId: user.id, actor: user.username, action: 'TWO_FACTOR_ENABLED', ip: requestIp(req) });
    res.status(200).json({ message: 'Two-factor sign-in is on.', recoveryCodes: plain });
  } catch (error) {
    sendError(res, error, 'Could not turn on two-factor sign-in', 500);
  }
};

/** POST /api/auth/2fa/disable { password } — needs the current password. */
exports.disableTwoFactor = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const password = String(req.body?.password || '');
    const ok = user.password && (isBcryptHash(user.password) ? await bcrypt.compare(password, user.password) : password === user.password);
    if (!ok) return res.status(401).json({ message: 'Your password is not correct.' });
    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null, totpRecoveryCodes: [] } });
    await auditEvent({ userId: user.id, actor: user.username, action: 'TWO_FACTOR_DISABLED', ip: requestIp(req) });
    res.status(200).json({ message: 'Two-factor sign-in is off.' });
  } catch (error) {
    sendError(res, error, 'Could not turn off two-factor sign-in', 500);
  }
};

/** GET /api/auth/2fa/status */
exports.twoFactorStatus = async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { totpEnabled: true, totpRecoveryCodes: true } });
  res.status(200).json({ enabled: Boolean(user?.totpEnabled), recoveryCodesLeft: user?.totpRecoveryCodes?.length || 0 });
};

/*
 * ---------------------------------------------------------------------------
 * Registration.
 *
 * RegistrationSetting had a full settings page — activation mode, username
 * rules, welcome email, captcha — and nothing consumed it, because there was
 * no signup endpoint at all. These two endpoints are the consumer.
 *
 * POST /api/auth/register        — create an account, honouring every rule
 * POST /api/auth/activation-rules — what the signup form should enforce
 * POST /api/auth/activate/:token — email-verification link target
 * ---------------------------------------------------------------------------
 */

/**
 * A JWT-free signed token for email links: value + HMAC, like a reset link.
 *
 * The key must be secret, and neither of the two values this used to fall back
 * to was: one was a constant in this file, the other is GOOGLE_CLIENT_ID, which
 * is published to every browser on purpose. Either let anyone who had read the
 * source mint a link for any user id and promote a pending account to Employee
 * without an administrator. There is no safe default for a signing key, so an
 * unset ACTIVATION_SECRET now refuses to sign or verify instead.
 */
function activationSecret() {
  const secret = String(process.env.ACTIVATION_SECRET || '').trim();
  return secret.length >= 16 ? secret : null;
}

function signActivation(userId) {
  const secret = activationSecret();
  if (!secret) return null;
  const value = crypto.createHmac('sha256', secret).update(`activate:${userId}`).digest('hex');
  return `${userId}.${value}`;
}

function verifyActivation(token) {
  const secret = activationSecret();
  if (!secret) return null;
  const [userId, sig] = String(token || '').split('.');
  if (!userId || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(`activate:${userId}`).digest('hex');
  // Length check first so a forged blob cannot reach the comparison.
  if (sig.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? userId : null;
}

/** The company a public signup is for: ?company=<slug>, else the original one. */
async function companyForSignup(req) {
  const slug = String(req.query?.company || req.body?.company || '').trim().toLowerCase();
  const company = slug
    ? await prisma.company.findUnique({ where: { slug } })
    : await prisma.company.findUnique({ where: { id: tenant.DEFAULT_COMPANY_ID } });
  return company && company.status === 'Active' ? company : null;
}

/** What the signup form should show and enforce. Public — no secrets in it. */
exports.activationRules = async (req, res) => {
  try {
    const company = await companyForSignup(req);
    if (!company) return res.status(404).json({ message: 'That company was not found.' });
    tenant.adopt(company.id);
    const settings = await getRegistrationSettings();
    res.status(200).json(publicRegistrationRules(settings));
  } catch (error) {
    sendError(res, error, 'Could not load the registration rules', 500);
  }
};

/**
 * Public signup. Every rule from Registration Settings is enforced here:
 * activation mode, username character set and length, password length, the
 * disallowed list from Security Settings, and the captcha flag (the server
 * refuses signups while it is on, rather than pretending a checkbox is a
 * captcha).
 */
exports.register = async (req, res) => {
  try {
    /* Which company is being joined: the signup link carries its slug
       (…/?company=acme). A link without one joins the original company. */
    const company = await companyForSignup(req);
    if (!company) {
      return res.status(404).json({ message: 'That company was not found.' });
    }
    tenant.adopt(company.id);

    const security = await getSecuritySettings();
    if (isBannedIp(req, security)) {
      return res.status(403).json({ message: 'Registration is not available from this address.' });
    }

    const settings = await getRegistrationSettings();

    if (String(settings.accountActivation) === 'Disable Registration') {
      return res.status(403).json({ message: 'Registration is currently disabled.' });
    }
    if (settings.enableCaptcha) {
      // The setting asks for a captcha; none is wired up. Refusing loudly is
      // honest — accepting signups without one would be the opposite of what
      // the administrator configured.
      return res.status(503).json({ message: 'Registration is not available right now.' });
    }

    const {
      username, firstName, lastName, email, password,
    } = req.body || {};
    const name = firstName;

    if (!username || !name || !email || !password) {
      return res.status(400).json({ message: 'Username, first name, email and password are required.' });
    }

    let cleanUsername = String(username).trim();
    if (settings.usernameLowercase) cleanUsername = cleanUsername.toLowerCase();

    // Length and character rules, exactly as the settings page defines them.
    if (cleanUsername.length < settings.usernameLengthMin
      || cleanUsername.length > settings.usernameLengthMax) {
      return res.status(400).json({
        message: `Username must be between ${settings.usernameLengthMin} and ${settings.usernameLengthMax} characters.`,
      });
    }
    const charRe = allowedUsernameChars(settings.limitUsernameCharacters);
    if (!charRe.test(cleanUsername)) {
      return res.status(400).json({ message: `Username allows: ${settings.limitUsernameCharacters}.` });
    }
    // The reserved superadmin name is never a signup choice.
    if (cleanUsername.toLowerCase() === 'admin' || isDisallowedUsername(cleanUsername, security)) {
      return res.status(400).json({ message: 'That username is not available.' });
    }

    if (password.length < settings.passwordLengthMin
      || password.length > settings.passwordLengthMax) {
      return res.status(400).json({
        message: `Password must be between ${settings.passwordLengthMin} and ${settings.passwordLengthMax} characters.`,
      });
    }

    // Usernames are unique across the whole platform, not just this company.
    if (await isUsernameTaken(cleanUsername)) {
      return res.status(409).json({ message: 'That username is already taken.' });
    }
    const emailTaken = await prisma.user.findFirst({
      where: { email: { equals: String(email).trim(), mode: 'insensitive' } },
    });
    if (emailTaken) {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }

    const ipAddress = requestIp(req) || '127.0.0.1';

    /* 'No Activation (immediate access)' signs the account straight in; every
       other mode parks it as Registered/Pending for the activate flow or the
       User Admin screen. Landing at the bottom of the ladder, never the
       schema default. */
    const immediate = String(settings.accountActivation) === 'No Activation (immediate access)';
    if (immediate) {
    // The plan's user limit (utils/billing.js).
    try { await assertSeatAvailable(company.id, 1); } catch (limitError) {
      return res.status(limitError.status || 402).json({ message: limitError.message, code: 'PLAN_LIMIT' });
    }
    }
    const user = await prisma.user.create({
      data: {
        username: cleanUsername,
        firstName: String(name).trim(),
        lastName: lastName ? String(lastName).trim() : null,
        email: String(email).trim(),
        password: await bcrypt.hash(password, 10),
        status: immediate ? 'Employee' : 'Registered',
        role: 'Employee',
        userlevel: 7,
        registeredIp: ipAddress,
        lastip: ipAddress,
      },
    });

    await prisma.systemLog.create({
      data: { username: user.username, event: 'REGISTER', ipAddress },
    }).catch(() => {});
    await auditEvent({
      userId: user.id,
      actor: user.username,
      action: 'ACCOUNT_REGISTERED',
      note: `Signed up from the registration form (${settings.accountActivation})`,
      ip: ipAddress,
    }).catch(() => {});

    const mode = String(settings.accountActivation);
    if (mode === 'User Activation (e-mail verification)' && user.email) {
      await sendActivationEmail(req, user).catch((err) => {
        console.error(`Activation email to ${user.email} failed:`, err.message);
      });
    }
    if (settings.sendWelcomeEmail && user.email) {
      await sendWelcomeEmail(req, user, settings).catch((err) => {
        console.error(`Welcome email to ${user.email} failed:`, err.message);
      });
    }

    if (immediate) {
      await applyRoleDefaults(user.id, user.status, 'self-signup').catch(() => {});
      // Immediate access: the same session shape the login endpoint issues.
      const session = await prisma.session.create({
        data: {
          username: user.username,
          ipAddress,
          userAgent: String(req.headers['user-agent'] || '').slice(0, 255),
          persistent: false,
          expiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      return res.status(201).json({
        message: 'Welcome to NexorCRM!',
        activated: true,
        token: `sess_${session.id}`,
        sessionId: session.id,
        user: { id: user.id, username: user.username, status: user.status },
      });
    }

    res.status(201).json({
      message: mode === 'Admin Activation'
        ? 'Account created. An administrator will activate it — you will be able to sign in once it is approved.'
        : 'Account created. Check your email for an activation link.',
      activated: false,
    });
  } catch (error) {
    sendError(res, error, 'Could not complete registration', 500);
  }
};

/** The email link lands here: flips Registered to Employee and says so. */
exports.activateAccount = async (req, res) => {
  try {
    const userId = verifyActivation(req.params.token);
    if (!userId) {
      return res.status(400).json({ message: 'This activation link is not valid. Ask for a new one or contact an administrator.' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ message: 'The account behind this link no longer exists.' });
    }
    tenant.adopt(user.companyId);

    const status = String(user.status || '').toLowerCase();
    if (status === 'banned' || status === 'suspended' || status === 'archived') {
      return res.status(403).json({ message: 'This account cannot be activated.' });
    }
    if (status === 'registered' || status === 'pending') {
    // The plan's user limit (utils/billing.js).
    try { await assertSeatAvailable(user.companyId, 1); } catch (limitError) {
      return res.status(limitError.status || 402).json({ message: limitError.message, code: 'PLAN_LIMIT' });
    }
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'Employee', role: 'Employee', userlevel: 7 },
      });
      await applyRoleDefaults(user.id, 'Employee', 'activation-link').catch(() => {});
      await auditEvent({
        userId: user.id,
        actor: user.username,
        action: 'ACCOUNT_ACTIVATED',
        note: 'Activated via emailed link',
      }).catch(() => {});
      return res.status(200).json({ message: 'Your account is active. You can sign in now.' });
    }

    // Already live (or admin-activated while the email sat unread).
    return res.status(200).json({ message: 'This account is already active.' });
  } catch (error) {
    sendError(res, error, 'Could not activate the account', 500);
  }
};

/* ---- registration emails ------------------------------------------------ */

async function sendActivationEmail(req, user) {
  const token = signActivation(user.id);
  if (!token) {
    // Better a colleague chasing an admin than a link anyone could forge.
    console.warn(`Activation email for ${user.username} skipped — set ACTIVATION_SECRET (16+ characters) to enable activation links.`);
    return;
  }
  const baseUrl = await appUrl(req, user);
  if (!baseUrl) {
    console.warn(`Activation email for ${user.username} skipped — set APP_URL so the link has somewhere safe to point.`);
    return;
  }
  await sendMail({
    to: user.email,
    category: 'activation',
    subject: 'Activate your NexorCRM account',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Welcome to NexorCRM</h2>
        <p>Hello ${escapeHtml(user.firstName || user.username)},</p>
        <p>Confirm your email address to activate your account:</p>
        <p><a href="${baseUrl}/?activation=${token}"
              style="display:inline-block;background:#f5c618;color:#0d172a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
           Activate Account</a></p>
        <p>If you did not sign up, you can ignore this email.</p>
      </div>
    `,
  });
}

async function sendWelcomeEmail(req, user, settings) {
  await sendMail({
    to: user.email,
    category: 'welcome',
    subject: 'Welcome to NexorCRM',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Welcome, ${escapeHtml(user.firstName || user.username)}!</h2>
        <p>Your NexorCRM account <strong>${escapeHtml(user.username)}</strong> has been created.</p>
        <p>${settings.accountActivation === 'Admin Activation'
          ? 'An administrator still needs to approve it — you will be able to sign in once that is done.'
          : 'You can now sign in.'}</p>
      </div>
    `,
  });
}

/** Issue and email one reset link. Runs inside the account's company. */
async function issueResetLink(req, user) {
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: {
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  // The token is NEVER returned in the response — handing a valid reset token
  // to whoever asked for it was a full account-takeover hole. A delivery
  // failure is the operator's to see in the log; an administrator can still
  // set a password from User Admin.
  if (!user.email) {
    console.warn(`Password reset requested for ${user.username} but the account has no email address on file.`);
    return;
  }
  const baseUrl = await appUrl(req, user);
  if (!baseUrl) {
    console.error('Password reset email not sent: APP_URL is not set, so there is no safe address for the link.');
    return;
  }
  const resetUrl = `${baseUrl}/?resetToken=${token}`;
  const result = await sendMail({
    to: user.email,
    category: 'password-reset',
    subject: 'Reset your NexorCRM password',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Reset your NexorCRM password</h2>
        <p>Hello ${escapeHtml(user.firstName || user.username)},</p>
        <p>We received a request to reset the password for your NexorCRM account <strong>${escapeHtml(user.username)}</strong>.</p>
        <p>
          <a href="${resetUrl}" style="display: inline-block; background: #f5c618; color: #0d172a; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
            Reset Password
          </a>
        </p>
        <p>This link expires in 30 minutes. If you did not request this, you can safely ignore this email.</p>
        <hr />
        <p style="color: #666; font-size: 12px;">Sent via NexorCRM</p>
      </div>
    `,
  });
  if (result.status === 'skipped') {
    console.warn(`Password reset for ${user.username} not emailed: ${result.error}.`);
  }
}

exports.forgotPassword = async (req, res) => {
  try {
    const { usernameOrEmail } = req.body;
    if (!usernameOrEmail || !String(usernameOrEmail).trim()) {
      return res.status(400).json({ message: 'Username or email is required' });
    }

    /* One email address can belong to accounts in several companies. Each
       gets its own link, sent through its own company's mail server; the
       emails name the username so the reader knows which is which. */
    const identifier = String(usernameOrEmail).trim();
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: identifier },
          { email: { equals: identifier, mode: 'insensitive' } },
        ],
      },
      take: 5,
    });

    // Housekeeping: expired rows are swept here rather than by a cron job.
    await prisma.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    }).catch(() => {});

    for (const user of users) {
      await tenant.runWithCompany(user.companyId, () => issueResetLink(req, user))
        .catch((error) => console.error(`Password reset for ${user.username} failed:`, error.message));
    }

    // The same answer for an unknown account and a known one: revealing the
    // difference lets anyone map which usernames and emails are real.
    return res.status(200).json({
      message: 'If an account exists for that username or email, a password reset link has been sent. It expires in 30 minutes.',
      emailSent: true,
    });
  } catch (error) {
    sendError(res, error, 'Server error during password reset request', 500);
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Reset token and new password are required' });
    }

    // Checked before the token is claimed: a password that fails the rules
    // must leave the link usable for a second try, not burn it.
    const passwordErr = validatePassword(newPassword);
    if (passwordErr) {
      return res.status(400).json({ message: passwordErr });
    }

    // Claim the token atomically: the update only lands while the row is
    // unused and unexpired, so a token presented twice — even in two
    // simultaneous requests — succeeds exactly once.
    const claim = await prisma.passwordResetToken.updateMany({
      where: {
        tokenHash: hashToken(token),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });
    if (claim.count === 0) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired. Please request a new one.' });
    }
    const owner = await prisma.user.findUnique({ where: { id: record.userId }, select: { companyId: true } });
    if (!owner) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired. Please request a new one.' });
    }
    tenant.adopt(owner.companyId);

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: record.userId },
      data: { password: hashedPassword, passwordChangedAt: new Date(), forcePasswordChange: false, user_login_attempts: 0, lockedUntil: null }
    });
    // Single-use: the row goes away the moment the reset lands.
    await prisma.passwordResetToken.delete({ where: { id: record.id } }).catch(() => {});

    const user = await prisma.user.findUnique({ where: { id: record.userId } });
    if (user) {
      await prisma.systemLog.create({
        data: { username: user.username, event: 'PASSWORD_RESET', ipAddress: requestIp(req) || '127.0.0.1' }
      });
      await auditEvent({ userId: user.id, actor: user.username, action: 'PASSWORD_CHANGED', field: 'password', note: 'Reset via email link' });
      // A reset ends every other session — the old password may have leaked.
      await prisma.session.deleteMany({ where: { username: user.username } }).catch(() => {});
    }

    res.status(200).json({ message: 'Password reset successful. You can now sign in with your new password.' });
  } catch (error) {
    sendError(res, error, 'Server error during password reset', 500);
  }
};

exports.logout = async (req, res) => {
  try {
    // Only a verified session is logged off. The body's username and
    // sessionId are whatever the caller typed, and trusting them let anyone
    // write LOGOFF rows against any account. A browser whose session already
    // expired has nothing left to end, so it simply gets its 200.
    const username = req.user?.username || null;
    const sessionId = req.sessionId || null;

    // Where this account lives, so the signed-out page can be the company's
    // own branded one rather than the platform's. Read before the session is
    // ended; a missing company just means the generic page.
    let companySlug = null;
    if (req.user?.companyId) {
      const company = await prisma.company.findUnique({
        where: { id: req.user.companyId },
        select: { slug: true },
      }).catch(() => null);
      companySlug = company?.slug || null;
    }

    if (username) {
      const ipAddress = requestIp(req) || '127.0.0.1';
      await prisma.systemLog.create({
        data: { username, event: 'LOGOFF', ipAddress }
      });
      // End the session row this browser was issued, so the token stops
      // working and the sessions tab reflects reality instead of showing
      // logins that already left.
      if (sessionId) {
        await prisma.session.deleteMany({ where: { id: sessionId, username } }).catch(() => {});
      }
      await prisma.user.updateMany({
        where: { username },
        data: { lastActiveIp: ipAddress },
      }).catch(() => {});
    }
    res.status(200).json({ message: 'Logout successful', company: companySlug });
  } catch (error) {
    sendError(res, error, 'Server error during logout', 500);
  }
};

/**
 * The signed-in user changes their own password.
 *
 * POST /api/auth/change-password  { currentPassword, newPassword, sessionId? }
 *
 * Distinct from reset-password: this one demands the current password first,
 * so it is what the "you must change your password" flow and My Profile use.
 */
exports.changeMyPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    // The verified session, not a body field: a client that left it out used
    // to have every session ended, its own included.
    const sessionId = req.sessionId || null;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new passwords are required.' });
    }
    const user = await prisma.user.findUnique({ where: { username: req.user.username } });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    let ok = false;
    if (user.password) {
      if (isBcryptHash(user.password)) {
        ok = await bcrypt.compare(currentPassword, user.password);
      } else {
        ok = currentPassword === user.password;
      }
    }
    if (!ok) return res.status(401).json({ message: 'Your current password is not correct.' });

    const passwordErr = validatePassword(newPassword);
    if (passwordErr) return res.status(400).json({ message: passwordErr });
    if (newPassword === currentPassword) {
      return res.status(400).json({ message: 'The new password must be different from the current one.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(newPassword, 10),
        passwordChangedAt: new Date(),
        forcePasswordChange: false,
      },
    });

    const ip = requestIp(req);
    await prisma.systemLog.create({
      data: { username: user.username, event: 'PASSWORD_CHANGED', ipAddress: ip || '127.0.0.1' }
    }).catch(() => {});
    await auditEvent({ userId: user.id, actor: user.username, action: 'PASSWORD_CHANGED', field: 'password', ip });

    // Keep the session this change came from, end the rest.
    await prisma.session.deleteMany({
      where: { username: user.username, ...(sessionId ? { id: { not: sessionId } } : {}) },
    }).catch(() => {});

    res.status(200).json({ message: 'Password changed successfully.' });
  } catch (error) {
    sendError(res, error, 'Could not change the password', 500);
  }
};
