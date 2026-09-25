/**
 * Where the session token lives between page loads.
 *
 * "Remember me" on the login form was a checkbox wired to nothing, so every
 * sign-in behaved the same and the setting meant nothing. It now decides the
 * storage:
 *
 *   remembered → localStorage — survives the browser closing, and the session
 *                row lives for SessionSetting.cookieExpiry days.
 *   otherwise  → sessionStorage — dies with the tab, and the session row lives
 *                a day.
 *
 * The token and its session id are the secrets, so only they move. The
 * username and status stay in localStorage either way: they are display
 * values, not credentials, and a couple of dozen screens read the username
 * from there.
 *
 * Everything that touches the token goes through here (App login/logout, the
 * fetch wrapper, Google sign-in), so the two stores never disagree.
 */

const SECRET_KEYS = ['token', 'sessionId'];
// companySlug: where this account signed in from (a company's own branded
// page), so an ended session can return there instead of the generic page.
// Display value, not a credential.
const DISPLAY_KEYS = ['loggedInUser', 'userStatus', 'forcePasswordChange', 'companySlug'];

export function setAuth({ token, username, sessionId, status, companySlug }, remember = false) {
  const secretStore = remember ? window.localStorage : window.sessionStorage;
  const otherStore = remember ? window.sessionStorage : window.localStorage;
  // A previous remembered login must not leave a stale token behind when the
  // next sign-in is not remembered (and the other way round).
  SECRET_KEYS.forEach((k) => otherStore.removeItem(k));
  if (token) secretStore.setItem('token', token);
  if (sessionId) secretStore.setItem('sessionId', sessionId);

  // Display values: always in localStorage for the screens that read them.
  if (username) window.localStorage.setItem('loggedInUser', username);
  if (status) window.localStorage.setItem('userStatus', status);
  // The slug names the branded sign-in page to return to on logout/401. An
  // account from the platform company has none, so the value is replaced,
  // never merged — a new sign-in on the generic page must clear the old one.
  if (companySlug) window.localStorage.setItem('companySlug', companySlug);
  else window.localStorage.removeItem('companySlug');
}

export function getToken() {
  return window.localStorage.getItem('token')
    || window.sessionStorage.getItem('token')
    || null;
}

export function getUsername() {
  return window.localStorage.getItem('loggedInUser') || '';
}

export function getSessionId() {
  return window.localStorage.getItem('sessionId')
    || window.sessionStorage.getItem('sessionId')
    || null;
}

export function clearAuth() {
  for (const store of [window.localStorage, window.sessionStorage]) {
    [...SECRET_KEYS, ...DISPLAY_KEYS].forEach((k) => store.removeItem(k));
  }
}
