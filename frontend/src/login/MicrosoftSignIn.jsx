import { useRef, useState } from 'react';
import { setAuth } from '../utils/sessionStore';
import { MicrosoftMark } from './ProviderLogos';
import useAuthProviders from './useAuthProviders';

/**
 * "Sign in with Microsoft" for the login screen.
 *
 * MSAL opens Microsoft's own popup, the user signs in there, and MSAL hands
 * this page a signed ID token. The token goes to POST /api/auth/microsoft,
 * which verifies it against Microsoft's public keys and issues one of our
 * ordinary session rows — so from here on a Microsoft sign-in is the same as
 * a password sign-in.
 *
 * No client secret is involved on this side: the client id is public by
 * design, and the page never holds anything it could forge a login with.
 *
 * The tile turns itself off, with the reason, unless the server reports a
 * Microsoft client id — an install without credentials shows a dimmed button
 * that says so rather than one that opens a popup and then fails.
 *
 * MSAL is loaded only when a click actually asks for it. It is the largest
 * dependency on this page and most people sign in with a password, so paying
 * for it on every visit to the login screen would be the wrong trade.
 */

/* Work, school and personal Microsoft accounts. The matching issuer check
   lives in the backend controller — `common` mints tokens for every tenant,
   so the audience claim is what proves a token was meant for this app. */
const AUTHORITY = 'https://login.microsoftonline.com/common';

export default function MicrosoftSignIn({ onError, onBusyChange }) {
  const { microsoftClientId: clientId } = useAuthProviders();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const appRef = useRef(null);

  /** One MSAL instance per page, created on first use. */
  async function getApp() {
    if (appRef.current) return appRef.current;
    const { PublicClientApplication } = await import('@azure/msal-browser');
    const app = new PublicClientApplication({
      auth: {
        clientId,
        authority: AUTHORITY,
        redirectUri: window.location.origin,
      },
      cache: {
        /* Nothing of Microsoft's is kept between visits. Our own session row is
           the thing that grants access, and it is revocable server-side; a
           cached Microsoft token would only be a second, longer-lived key we
           could not revoke. */
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false,
      },
    });
    await app.initialize();
    appRef.current = app;
    return app;
  }

  async function signIn() {
    if (!clientId || busy) return;
    setFailed('');
    onError?.('');
    setBusy(true);
    onBusyChange?.(true);
    try {
      const app = await getApp();
      const result = await app.loginPopup({
        scopes: ['openid', 'profile', 'email'],
        prompt: 'select_account',
      });

      if (!result?.idToken) {
        setFailed('Microsoft did not return a sign-in token.');
        return;
      }

      const res = await fetch('/api/auth/microsoft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: result.idToken }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        onError?.(data?.message || 'Microsoft sign-in was refused.');
        return;
      }

      /* Not "remembered": this is an explicit sign-in on this device, so the
         token lives in sessionStorage and dies with the tab — exactly like an
         unticked Remember-me password login. */
      setAuth(
        {
          token: data.token,
          username: data.user.username,
          sessionId: data.sessionId,
          status: data.user?.status,
        },
        false,
      );
      // A Microsoft account has no password here, so nothing is ever forced.
      localStorage.removeItem('forcePasswordChange');
      window.location.href = '/';
      return;
    } catch (err) {
      /* Closing the popup is a decision, not a fault — say nothing for it. */
      const code = err?.errorCode || '';
      if (code === 'user_cancelled' || code === 'popup_window_error' || /closed/i.test(err?.message || '')) {
        return;
      }
      onError?.('Could not complete Microsoft sign-in. Please try again.');
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  const off = !clientId;

  return (
    <button
      type="button"
      className={`nx-card__social-btn${off ? ' is-off' : ''}`}
      onClick={signIn}
      disabled={off || busy}
      title={
        failed
        || (off ? 'Microsoft sign-in is not configured on this server yet.' : 'Sign in with Microsoft')
      }
    >
      <MicrosoftMark size={17} />
      <span>{busy ? 'Opening…' : 'Microsoft'}</span>
    </button>
  );
}
