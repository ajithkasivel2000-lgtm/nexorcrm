import { ANY, subscribeDataChanged, resourceFromPath } from './dataBus';

/**
 * One network request per URL, however many components ask for it.
 *
 * Two separate problems, solved in one place because both are about the same
 * GET being issued more than once:
 *
 *  1. CONCURRENT duplicates. The lead record, the status cell and the status
 *     dialog each ask for /api/users as they mount, and StrictMode mounts every
 *     one of them twice in development. Nine components asking at the same
 *     instant produced nine requests for one answer. While a GET is in flight
 *     its promise is shared, so the second caller and the ninth get the first
 *     caller's response rather than starting their own.
 *
 *  2. REPEATED duplicates. The master lists — users, projects, the source and
 *     status tables — change rarely and are read by nearly every screen. Those
 *     are held briefly after they resolve, so moving between screens does not
 *     re-download them.
 *
 * Freshness is not traded away for either. The hold is seconds long, and any
 * write to a resource clears it immediately through the same dataBus the live
 * refresh already uses — so a lead edited on one screen still appears on the
 * next, exactly as before this existed.
 *
 * Deliberately NOT cached: anything that is not a plain GET, anything carrying
 * a body or an abort signal, and any endpoint not named below. The default is
 * to dedupe only, which can never serve a stale answer because every sharer
 * receives the one response that is already on its way.
 */

/** How long a resolved master list may be reused. */
const CACHE_MS = 30_000;

/**
 * Resources stable enough to hold briefly.
 *
 * Keyed by the first path segment, the same way dataBus names a resource, so a
 * write to any of them clears the matching entries without a second list to
 * keep in step.
 */
const CACHEABLE = new Set([
  'users', 'projects', 'departments',
  'lead-statuses', 'lead-types', 'open-reasons', 'call-statuses',
  'primary-sources', 'secondary-sources', 'tertiary-sources',
  'project-types', 'project-statuses', 'rrq-types',
  'user-permissions', 'user-groups', 'settings', 'staff-masters',
]);

/** In-flight GETs: key -> Promise<Response>. */
const inflight = new Map();
/**
 * Settled GETs worth holding: key -> { at, status, statusText, headers, body }.
 *
 * The body is kept as text, not as a Response. A Response body is a stream, and
 * a clone nobody reads leaves that stream undrained and its bytes buffered for
 * as long as the entry lives — so holding Response objects would quietly retain
 * a copy of every master list and clone those clones on each hit. Text costs
 * one small string and rebuilds into a fresh, independent Response every time.
 */
const held = new Map();

/** Never let the hold grow without bound, however long a session runs. */
const MAX_HELD = 40;

const keyOf = (url) => {
  try {
    const u = new URL(url, window.location.origin);
    return u.pathname + u.search;
  } catch {
    return url;
  }
};

const resourceOf = (url) => {
  try {
    return resourceFromPath(new URL(url, window.location.origin).pathname);
  } catch {
    return null;
  }
};

/**
 * A response handed to a caller that is safe for them to consume.
 *
 * A body can only be read once, so each caller needs its own copy: sharers of an
 * in-flight request get a clone, and a cache hit gets a Response rebuilt from
 * the held text.
 */
const share = (response) => response.clone();

const rebuild = (entry) => new Response(entry.body, {
  status: entry.status,
  statusText: entry.statusText,
  headers: entry.headers,
});

/** Whether this request may take part at all. */
export function isShareable(url, init, method) {
  if (method !== 'GET') return false;
  if (init && (init.body || init.signal)) return false;
  // An explicit opt-out stays an opt-out.
  if (init && (init.cache === 'no-store' || init.cache === 'reload')) return false;
  return Boolean(resourceOf(url));
}

/**
 * Runs `send()` unless the same GET is already on its way or recently answered.
 *
 * @param {string}   url    the request URL
 * @param {Function} send   () => Promise<Response>, called at most once
 */
export function shared(url, send) {
  const key = keyOf(url);

  const hit = held.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return Promise.resolve(rebuild(hit));
  }
  if (hit) held.delete(key);

  const pending = inflight.get(key);
  if (pending) return pending.then(share);

  const request = send()
    .then((response) => {
      /* Only a good answer is worth reusing. A 500 held for thirty seconds
         would turn one server hiccup into half a minute of a dead screen.

         Read into text here, on a clone, so the entry owns its bytes and no
         stream is left open behind it. Failing to read it is not a failure of
         the request: the caller still gets its own untouched response. */
      if (response.ok && CACHEABLE.has(resourceOf(url))) {
        response.clone().text().then((body) => {
          if (held.size >= MAX_HELD) held.delete(held.keys().next().value);
          held.set(key, {
            at: Date.now(),
            body,
            status: response.status,
            statusText: response.statusText,
            headers: [...response.headers.entries()],
          });
        }).catch(() => { /* not worth holding, not worth failing over */ });
      }
      return response;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request.then(share);
}

/** Drop everything held for one resource, or all of it. */
export function invalidate(resource) {
  if (!resource || resource === ANY) {
    held.clear();
    return;
  }
  [...held.keys()].forEach((key) => {
    if (resourceOf(key) === resource) held.delete(key);
  });
}

/**
 * A write to a resource makes what is held for it out of date at once.
 *
 * Subscribed here rather than in each screen so the hold can never outlive the
 * data it describes: apiAuth publishes after every successful write, and this
 * clears before the refetch that follows it is sent.
 */
export function installRequestCache() {
  subscribeDataChanged(ANY, (resource) => invalidate(resource));
}
