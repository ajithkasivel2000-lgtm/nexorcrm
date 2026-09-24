const express = require('express');
const router = express.Router();
const { rateLimit } = require('../middleware/rateLimit');
const loginLimit = rateLimit('login', { max: 10, windowMs: 60 * 1000 });
const signupLimit = rateLimit('signup', { max: 5, windowMs: 60 * 60 * 1000 });
const resetLimit = rateLimit('reset', { max: 5, windowMs: 15 * 60 * 1000 });
const authController = require('../controllers/authController');
const googleAuth = require('../controllers/googleAuthController');
const microsoftAuth = require('../controllers/microsoftAuthController');
const { authMiddleware, optionalAuth } = require('../middleware/authMiddleware');
// Signed-out entry points: they find their company from the account, token or
// signup link before writing anything (see utils/tenant.js).
const { resolvingRoute } = require('../utils/tenant');

router.post('/login', loginLimit, resolvingRoute, authController.login);

/* Self-service signup. Deliberately public — that is the point of it — and
   enforcing every rule from Registration Settings server-side. */
router.post('/register', signupLimit, resolvingRoute, authController.register);
// What the signup form should enforce, before anyone has an account.
router.get('/activation-rules', resolvingRoute, authController.activationRules);
// The emailed link's target.
router.post('/activate/:token', resolvingRoute, authController.activateAccount);
router.get('/activate/:token', resolvingRoute, authController.activateAccount);

/* Which sign-in methods this server offers. Deliberately public and
   unauthenticated: the login page has to ask before anyone has signed in, and
   it returns only the Google client id, which is public by design. */
router.get('/providers', resolvingRoute, googleAuth.providers);

/* Verifies a Google ID token and issues an ordinary session. Public for the
   same reason /login is — it IS the sign-in. */
router.post('/google', loginLimit, resolvingRoute, googleAuth.googleSignIn);

/* Verifies a Microsoft ID token and issues an ordinary session. Public for the
   same reason /google is — it IS the sign-in. */
router.post('/microsoft', loginLimit, resolvingRoute, microsoftAuth.microsoftSignIn);
// optionalAuth resolves the session when a token is presented, so logout
// revokes the exact row this browser holds; without a token it still answers
// 200, because a signed-out visitor logging out is not an error.
router.post('/logout', optionalAuth, authController.logout);
router.post('/forgot-password', resetLimit, resolvingRoute, authController.forgotPassword);
router.post('/reset-password', resetLimit, resolvingRoute, authController.resetPassword);
// The signed-in user changing their own password. Requires the current one.
router.post('/change-password', authMiddleware, authController.changeMyPassword);

// Two-factor sign-in (authenticator app). verify finishes a login, so it is
// signed-out and rate-limited like the password step.
router.post('/2fa/verify', loginLimit, resolvingRoute, authController.verifyTwoFactor);
router.get('/2fa/status', authMiddleware, authController.twoFactorStatus);
router.post('/2fa/setup', authMiddleware, authController.setupTwoFactor);
router.post('/2fa/enable', authMiddleware, authController.enableTwoFactor);
router.post('/2fa/disable', authMiddleware, authController.disableTwoFactor);

module.exports = router;
