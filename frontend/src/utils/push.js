/**
 * Web Push subscription, from the browser's side.
 *
 * Three things have to line up before a notification can arrive: the browser
 * must support push, the user must grant permission, and the service worker
 * must be registered. Each is reported separately here, because "it didn't
 * work" is useless when any of the three could be the reason.
 */

/** Push needs all three of these; Safari on iOS only has them when installed. */
export function isPushSupported() {
  return 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

/** 'unsupported' | 'default' | 'granted' | 'denied' */
export function permissionState() {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * The VAPID public key arrives base64url-encoded, and PushManager wants bytes.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/** Registers the worker that will be woken when a notification arrives. */
async function getRegistration() {
  const existing = await navigator.serviceWorker.getRegistration('/sw.js');
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js');
}

/**
 * Subscribes this browser and records it against the signed-in user.
 *
 * Asking for permission has to happen in response to something the user did —
 * browsers ignore or penalise an unprompted request — so this is called from a
 * button, never on load.
 *
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function enablePush(username) {
  if (!isPushSupported()) {
    return { ok: false, reason: 'This browser cannot receive push notifications.' };
  }

  const config = await fetch('/api/push/public-key')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  if (!config || !config.enabled || !config.publicKey) {
    return { ok: false, reason: 'Push is not configured on the server.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      reason: permission === 'denied'
        ? 'Notifications are blocked for this site. Allow them in your browser settings to turn this on.'
        : 'Notification permission was not granted.',
    };
  }

  try {
    const registration = await getRegistration();
    // Wait for the worker to be usable; a freshly registered one is still
    // installing and subscribing against it throws.
    await navigator.serviceWorker.ready;

    // Re-subscribing returns the existing subscription, so this is safe to
    // call again — and the server upserts on the endpoint.
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    });

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON(), userId: username }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, reason: data.message || 'The server would not record this browser.' };
    }
    return { ok: true };
  } catch (error) {
    console.error('Push subscription failed', error);
    return { ok: false, reason: 'Could not subscribe this browser.' };
  }
}

/** Stops notifications on this browser, both locally and on the server. */
export async function disablePush() {
  if (!isPushSupported()) return { ok: true };
  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return { ok: true };

    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
    return { ok: true };
  } catch (error) {
    console.error('Could not unsubscribe', error);
    return { ok: false, reason: 'Could not turn notifications off.' };
  }
}

/**
 * Whether this browser is subscribed, and for the person signed in now.
 *
 * A subscription belongs to the browser, but the server maps it to whichever
 * user was signed in when it was created. On a shared machine that goes stale
 * the moment someone else signs in: the browser still holds a subscription, so
 * the menu says it is on, while the notifications keep going to the previous
 * user. Re-registering the existing subscription moves it to the current one —
 * the server keys on the endpoint, so this updates rather than duplicates.
 *
 * No permission prompt is involved: this only runs once permission is granted
 * and a subscription already exists.
 */
export async function isSubscribed(username) {
  if (!isPushSupported() || Notification.permission !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return false;

    if (username) {
      // Best effort. Being unable to reach the server does not make the
      // browser any less subscribed.
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON(), userId: username }),
      }).catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

/** Asks the server to send this user a test notification. */
export async function sendTestPush(username) {
  const res = await fetch('/api/push/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: username }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, message: data.message || (res.ok ? 'Sent.' : 'Could not send.') };
}
