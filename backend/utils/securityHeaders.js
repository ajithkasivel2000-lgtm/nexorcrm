/**
 * Security headers on every response.
 *
 * Applied before the routes so even an error answer carries them. The CSP is
 * drawn from what the SPA really loads — anything stricter broke the app,
 * anything looser is not in here:
 *
 *   - Google Fonts (stylesheets and font files), Cashfree checkout, and
 *     flagcdn.com images are the only third-party loads;
 *   - Google Identity Services renders its sign-in button in an iframe from
 *     accounts.google.com, and its token endpoints are contacted by its
 *     script — frame-src and connect-src admit those hosts;
 *   - the PDF preview renders into a blob: iframe;
 *   - Socket.IO speaks over the page's own origin (ws: / wss: in
 *     connect-src);
 *   - Vite builds hash its assets, so script-src can be 'self' without
 *     unsafe-inline for scripts; styles keep unsafe-inline because the app
 *     sets inline style attributes in many components.
 *
 * Everything else is closed: object-src 'none', base-uri 'none', framing
 * only from the app's own pages. HSTS is only sent over HTTPS — locally,
 * where the app is plain HTTP, it would do nothing anyway.
 */

const LONG_MAX_AGE = 31536000; // one year, for HSTS and static assets

const fontHosts = 'https://fonts.googleapis.com https://fonts.gstatic.com';

function contentSecurityPolicy() {
  return [
    "default-src 'self'",
    // Inline style attributes are used across components; <style> blocks are
    // not, but the attribute form cannot be separated from the element form,
    // so both are allowed. No script ever loads this way.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `font-src 'self' ${fontHosts}`,
    `img-src 'self' data: blob: https://flagcdn.com`,
    // Google Identity Services: its button iframe and its token endpoints.
    `script-src 'self' https://accounts.google.com https://sdk.cashfree.com`,
    `frame-src 'self' blob: https://accounts.google.com https://sdk.cashfree.com https://payments.cashfree.com https://payments-test.cashfree.com`,
    // blob: for the PDF preview; ws/wss for Socket.IO on the same origin.
    `connect-src 'self' blob: ws: wss: ${fontHosts} https://flagcdn.com https://sdk.cashfree.com https://api.cashfree.com https://payments.cashfree.com https://payments-test.cashfree.com`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}

function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Nothing here needs the legacy PowerShell/Flash helpers or unfiltered HTML.
  res.set('X-Permitted-Cross-Domain-Policies', 'none');
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  // The SPA and API share an origin, so isolation costs nothing here.
  res.set('Cross-Origin-Resource-Policy', 'same-origin');
  res.set('Content-Security-Policy', contentSecurityPolicy());

  // Only meaningful over HTTPS, which nginx terminates in production.
  if (req.secure) {
    res.set('Strict-Transport-Security', `max-age=${LONG_MAX_AGE}; includeSubDomains`);
  }

  // API answers are per-request data; the SPA shell carries its own cache
  // headers from express.static. No-cache keeps authed responses out of
  // shared caches without breaking the SPA.
  if (req.path.startsWith('/api/')) {
    res.set('Cache-Control', 'no-store');
  }

  return next();
}

module.exports = { securityHeaders, contentSecurityPolicy, LONG_MAX_AGE };
