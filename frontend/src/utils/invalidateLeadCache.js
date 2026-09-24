/**
 * App-wide lead cache invalidation.
 *
 * Why: The CRM has several independent components that each fetch their own
 * lead lists / counts / dashboard stats. After a create / update / delete /
 * status change / assignment / follow-up / log, those components would keep
 * showing stale data until a browser refresh.
 *
 * This module gives every lead-aware component a single, reliable trigger to
 * re-fetch from the server. It is intentionally dumb:
 *   - It does not cache lead data itself.
 *   - It does not know which components exist.
 *   - It does not poll.
 *
 * Usage after any successful lead mutation:
 *   import invalidateLeadCache from '../utils/invalidateLeadCache';
 *   await mutate(...);
 *   invalidateLeadCache();   // tell every lead view to reload from the API
 *
 * Components that want to stay in sync subscribe via the
 * useInvalidateLeadCache() hook and re-run their fetcher when the signal
 * fires. Components that already call refresh() explicitly can keep doing so
 * AND also benefit from the broadcast for sibling views.
 */

let currentVersion = 0;
const listeners = new Set();

export { invalidateLeadCache as default };

export function invalidateLeadCache() {
  currentVersion += 1;
  // Notify all subscribers synchronously so a single mutation triggers one
  // coordinated refetch wave rather than N independent timers.
  listeners.forEach(listener => {
    try { listener(currentVersion); } catch (err) {
      console.error('Lead cache invalidation listener threw:', err);
    }
  });
}

/**
 * Returns a stable callback that fires the subscriber's refetch logic every
 * time any lead mutation invalidates the cache.
 */
export function subscribeLeadCacheInvalidation(onInvalidate) {
  listeners.add(onInvalidate);
  return () => {
    listeners.delete(onInvalidate);
  };
}
