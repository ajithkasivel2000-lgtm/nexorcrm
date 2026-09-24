/**
 * "Something changed" — the app-wide signal that keeps screens live.
 *
 * The CRM has dozens of independent screens that each fetch their own rows.
 * Create a user on one, promote them on another, and every other view kept
 * showing what it had loaded until the page was reloaded by hand. The lead
 * screens already solved this for themselves with a private broadcast; this is
 * that idea generalised so every resource gets it, rather than leads alone.
 *
 * Deliberately dumb, and it stays that way:
 *   - it holds no data and caches nothing
 *   - it does not know which screens exist
 *   - it does not poll
 *
 * It only says "rows of kind X have changed"; each subscriber decides whether
 * that concerns it and refetches from the API. The server stays the single
 * source of truth, so two screens can never drift into disagreeing about a
 * record the way a shared client-side cache lets them.
 *
 * Publishing is almost always automatic: utils/apiAuth.js watches the fetch it
 * already wraps and fires this after any successful POST / PUT / PATCH /
 * DELETE to /api/. Call notifyDataChanged() by hand only for a change that
 * does not go through the API.
 */

/** The wildcard: subscribers registered under it hear every change. */
export const ANY = '*';

const listeners = new Map();   // resource -> Set<fn>
let version = 0;

function listenersFor(resource) {
  if (!listeners.has(resource)) listeners.set(resource, new Set());
  return listeners.get(resource);
}

/**
 * Turn an API path into the resource name a screen would subscribe to.
 *
 *   /api/users              -> users
 *   /api/users/123/activate -> users
 *   /api/settings/mail      -> settings
 *
 * The first segment is deliberately as deep as this goes. A finer key would
 * mean a screen showing "users" missing a change posted to "users/123/roles",
 * and a missed refresh is a worse failure than an extra one.
 */
export function resourceFromPath(pathname) {
  const m = /^\/api\/([^/?#]+)/.exec(pathname || '');
  return m ? m[1].toLowerCase() : null;
}

/**
 * Announce that rows of this kind have changed.
 *
 * @param {string} resource  e.g. 'users', 'leads'. Omit for "everything".
 */
export function notifyDataChanged(resource = ANY) {
  version += 1;
  const targets = new Set([...listenersFor(resource), ...listenersFor(ANY)]);
  // A wildcard publish has to reach every subscriber, not only the wildcard ones.
  if (resource === ANY) listeners.forEach((set) => set.forEach((fn) => targets.add(fn)));

  targets.forEach((fn) => {
    try {
      fn(resource, version);
    } catch (err) {
      // One screen's broken handler must not stop the others being told.
      console.error('A data-change subscriber threw:', err);
    }
  });
}

/**
 * Listen for changes. Returns an unsubscribe function.
 *
 * @param {string|string[]} resource  a name, several names, or ANY
 * @param {Function} onChange         (resource, version) => void
 */
export function subscribeDataChanged(resource, onChange) {
  const keys = Array.isArray(resource) ? resource : [resource || ANY];
  keys.forEach((k) => listenersFor(k).add(onChange));
  return () => keys.forEach((k) => listenersFor(k).delete(onChange));
}
