/* NexorCRM service worker — notifications only.
 *
 * It caches nothing on purpose. A service worker is required for Web Push
 * because the browser wakes *it*, not the page, when a notification arrives —
 * which is what lets a notification show up while NexorCRM is closed. Adding
 * caching here would change how the app updates, so it stays out.
 */

// Take over as soon as a new version is installed, rather than waiting for
// every tab to close. Otherwise a fixed worker can sit unused for days.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  // A push with no readable body still deserves a notification: showing
  // something generic is required anyway (browsers penalise a push that
  // displays nothing), and silence looks like the feature is broken.
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data && event.data.text ? event.data.text() : '' };
  }

  const title = payload.title || 'NexorCRM';
  const options = {
    body: payload.body || 'You have a new notification.',
    icon: '/favicon.png',
    badge: '/favicon.png',
    // Same tag replaces an earlier notification about the same record rather
    // than stacking duplicates.
    tag: payload.tag || 'nexorcrm',
    data: { url: payload.url || '/' },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  // Focus a tab that is already open rather than opening another copy of the
  // app, and navigate it to the record the notification is about.
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) {
          try { await client.navigate(target); } catch { /* cross-origin or blocked */ }
        }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
