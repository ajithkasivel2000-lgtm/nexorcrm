/**
 * Attaches the session token to every same-origin /api/ request.
 *
 * The backend's authMiddleware verifies the token issued by POST /api/auth/login
 * (see backend/middleware/authMiddleware.js). Without it every protected route —
 * each read, create, update and delete — answers 401.
 *
 * Patching fetch once here keeps the header on all ~120 existing call sites
 * instead of threading it through each one by hand.
 *
 * Scoped deliberately to same-origin /api/ paths so the token is never sent
 * to third parties.
 *
 * It also answers a 401 globally: the session row has been revoked or has
 * expired, so keeping the UI on screen would only produce a wall of errors.
 * The user is dropped on the login screen with a note saying why.
 */
import { getToken, getUsername, clearAuth } from './sessionStore';
import { notifyDataChanged, resourceFromPath } from './dataBus';
import { installRequestCache, isShareable, shared } from './requestCache';

const API_PREFIX = '/api/';

function isInternalApiUrl(url) {
  try {
    const resolved = new URL(url, window.location.origin);
    return resolved.origin === window.location.origin &&
           resolved.pathname.startsWith(API_PREFIX);
  } catch {
    return false;
  }
}

/** Endpoints a signed-out user must be able to call — no token needed. */
const PUBLIC_ENDPOINTS = [
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  // Which sign-in methods the server offers — asked before anyone has a token.
  '/api/auth/providers',
  // Google sign-in IS the sign-in. It must be public for the same reason
  // /login is, and specifically so that its own 401 ("that Google sign-in
  // could not be verified") is shown to the user rather than being mistaken
  // for an expired session and turned into a sign-out and a page reload.
  '/api/auth/google',
  // Microsoft sign-in has the same shape — MSAL mints the ID token in a popup
  // and the server verifies it — so its failures belong on the card too, not
  // behind a forced sign-out. The 2FA step also mints no session of its own
  // until the code is verified, so its 401s (a wrong code) must stay inline.
  '/api/auth/microsoft',
  '/api/auth/2fa/verify',
  // The buyer portal signs in with its own token (X-Buyer-Token); a staff
  // token must not ride along, and a buyer's 401 must not sign staff out.
  '/api/buyer',
];
// Logout is deliberately NOT on this list: it should carry the token so the
// backend revokes the exact session row this browser holds.

function isPublicEndpoint(url) {
  const path = new URL(url, window.location.origin).pathname;
  return PUBLIC_ENDPOINTS.some((p) => path === p || path.startsWith(`${p}/`));
}

export default function installApiAuth() {
  if (typeof window === 'undefined' || window.__apiAuthInstalled) return;
  window.__apiAuthInstalled = true;

  /* Lets a write clear what the cache below is holding for that resource. */
  installRequestCache();

  const originalFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (!url || !isInternalApiUrl(url)) return originalFetch(input, init);

    // Merge rather than replace: existing headers (Content-Type, etc.) stay.
    // A caller that sets Authorization explicitly keeps its own value.
    const headers = new Headers(
      (init && init.headers) || (input instanceof Request ? input.headers : undefined)
    );

    const token = getToken();
    if (token && !isPublicEndpoint(url)) {
      if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
      // Kept alongside the header so the backend can log who a request came
      // from before the token is verified, and for screens that only need a
      // display name. Identity itself is the token, not this header.
      const username = getUsername();
      if (username && !headers.has('x-username')) headers.set('x-username', username);
    }

    const method = String(
      (init && init.method) || (input instanceof Request ? input.method : 'GET'),
    ).toUpperCase();

    /* One request per URL.
       Every screen fetches what it needs as it mounts, so opening the lead
       record asked for the same user list from the record, the status cell and
       the status dialog at once — and StrictMode mounts each of them twice in
       development, doubling it again. Sharing the in-flight promise collapses
       all of that to one request without any screen having to know the others
       exist, and without StrictMode being turned off to hide it.

       Applied here rather than at the call sites because this wrapper already
       sees every one of them. */
    const send = () => originalFetch(input, { ...init, headers });
    const handled = isShareable(url, init, method) ? shared(url, send) : send();

    // A 401 on a protected call means the session is gone: revoked in the
    // sessions tab, expired, or wiped by a password reset. Everything after
    // it would fail the same way, so sign the tab out cleanly.
    handled.then((response) => {
      if (
        response.status === 401
        && !isPublicEndpoint(url)
        && !window.__apiAuthSigningOut
        && getToken()
      ) {
        window.__apiAuthSigningOut = true;
        // A company's own sign-in page is where this session started; return
        // there (read before the wipe below takes it away).
        const slug = window.localStorage.getItem('companySlug');
        clearAuth();
        window.location.href = slug
          ? `/?company=${encodeURIComponent(slug)}&session=ended`
          : '/?session=ended';
        return;
      }

      /* 402: the company's trial or subscription has lapsed. The shell shows
         why and sends administrators to the billing page. */
      if (response.status === 402) {
        response.clone().json().then((body) => {
          if (body?.code === 'SUBSCRIPTION_INACTIVE') {
            window.dispatchEvent(new CustomEvent('nx:subscription-inactive', { detail: body.message }));
          }
        }).catch(() => {});
      }

      /* Anything that changed data on the server tells the rest of the app so,
         from here rather than from each of the ~120 call sites. Creating a
         user, promoting one, editing a lead — every screen showing those rows
         refetches, instead of waiting for a page reload to notice.

         Only on success: a rejected write changed nothing, and refetching
         after it would just be noise. */
      if (response.ok && method !== 'GET' && method !== 'HEAD') {
        try {
          const { pathname } = new URL(url, window.location.origin);
          notifyDataChanged(resourceFromPath(pathname));
        } catch { /* a URL we cannot parse is not worth failing a request over */ }
      }
    }).catch(() => {});

    return handled;
  };
}
