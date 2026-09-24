import { useEffect, useRef, useState } from 'react';
import { setAuth } from '../utils/sessionStore';
import { GoogleMark } from '../login/ProviderLogos';
import useAuthProviders from '../login/useAuthProviders';

/**
 * "Sign in with Google" for the login screen.
 *
 * Google Identity Services renders the button itself and hands back a signed
 * ID token. That token goes to POST /api/auth/google, which verifies it
 * against Google's public keys and issues one of our ordinary session rows —
 * so from here on a Google sign-in is the same as a password sign-in.
 *
 * No client secret is involved on this side: the client id is public by
 * design, and the page never sees anything it could forge a login with.
 *
 * Renders nothing at all unless the server says Google sign-in is configured,
 * so an install without credentials shows a normal password-only login rather
 * than a button that cannot work.
 */

const GSI_SRC = 'https://accounts.google.com/gsi/client';

/** Loads the Google script once, however many components ask for it. */
let scriptPromise = null;
function loadGsi() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) { resolve(); return; }
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('blocked')));
      return;
    }
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('blocked'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export default function GoogleSignIn({ theme = 'dark', onError, onBusyChange, onConfigProblem, variant = 'block' }) {
  const holder = useRef(null);
  const { googleClientId: clientId } = useAuthProviders();
  const [unavailable, setUnavailable] = useState(false);
  /* Set when Google itself rejects the configuration, so the page can say so
     instead of leaving the only explanation on Google's error screen. */
  const [misconfigured, setMisconfigured] = useState('');

  /* Held in refs, not read from the closure: the parent passes these inline,
     so a new identity arrives on every render. In the effect's dependency
     list they would tear down and re-initialise Google's button on each one. */
  const onErrorRef = useRef(onError);
  const onBusyRef = useRef(onBusyChange);
  const onConfigRef = useRef(onConfigProblem);
  useEffect(() => {
    onErrorRef.current = onError;
    onBusyRef.current = onBusyChange;
    onConfigRef.current = onConfigProblem;
  });

  /* ---- draw the button --------------------------------------------------- */
  useEffect(() => {
    if (!clientId || !holder.current) return undefined;
    let cancelled = false;

    const handleCredential = async (response) => {
      if (!response?.credential) return;
      onErrorRef.current?.('');
      onBusyRef.current?.(true);
      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: response.credential }),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          onErrorRef.current?.(data?.message || 'Google sign-in was refused.');
          onBusyRef.current?.(false);
          return;
        }

        /* Google sign-in is not "remembered" — it is an explicit sign-in on
           this device, so the token lives in sessionStorage and dies with the
           tab, exactly like an unticked Remember-me password login. */
        setAuth(
          {
            token: data.token,
            username: data.user.username,
            sessionId: data.sessionId,
            status: data.user?.status,
          },
          false,
        );
        // A Google account has no password, so nothing is ever forced here.
        localStorage.removeItem('forcePasswordChange');
        window.location.href = '/';
      } catch {
        onErrorRef.current?.('Could not reach the server to complete Google sign-in.');
        onBusyRef.current?.(false);
      }
    };

    loadGsi()
      .then(() => {
        if (cancelled || !holder.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredential,
          /* Never sign someone in without them choosing. A returning visitor
             still gets one tap to confirm, rather than the page deciding for
             them which of several Google accounts they meant. */
          auto_select: false,
          cancel_on_tap_outside: true,
          context: 'signin',
        });
        holder.current.innerHTML = '';
        window.google.accounts.id.renderButton(holder.current, {
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          type: 'standard',
          shape: 'rectangular',
          text: 'signin_with',
          logo_alignment: 'left',
          // GIS takes a pixel number, not a percentage, and caps at 400.
          width: Math.min(400, Math.max(200, holder.current.offsetWidth || 320)),
        });

        /* One Tap: the card Chrome shows offering the Google account already
           signed in to the browser, so the common case is one click rather
           than button -> chooser -> account. Clicking the tile still opens the
           full account chooser, which is what someone with several accounts
           wants.

           The callback is where a misconfigured client id becomes visible.
           Without it, a client id Google does not recognise fails only inside
           Google's own popup ("Access blocked: the OAuth client was not
           found"), which looks like the app is broken and says nothing about
           where to fix it. Most suppression reasons are ordinary — a dismissed
           card, blocked third-party cookies — and stay silent. */
        try {
          window.google.accounts.id.prompt((notification) => {
            if (!notification?.isNotDisplayed?.()) return;
            const reason = notification.getNotDisplayedReason?.();
            if (reason === 'invalid_client' || reason === 'unregistered_origin') {
              setMisconfigured(reason);
              onConfigRef.current?.(reason === 'invalid_client'
                ? 'Google does not recognise the GOOGLE_CLIENT_ID this server is using. Check it in backend/.env.'
                : `Google does not list ${window.location.origin} as an authorised JavaScript origin on that OAuth client.`);
            }
          });
        } catch { /* suppressed */ }
      })
      .catch(() => {
        /* An ad blocker, an offline machine or a locked-down network can stop
           the script loading. Say so rather than leaving a blank gap where a
           button was promised. */
        if (!cancelled) setUnavailable(true);
      });

    return () => { cancelled = true; };
  }, [clientId, theme]);

  /* The tile the login card draws: our own markup, with Google's real button
     laid over it at zero opacity so the click that starts the flow is a
     genuine click on Google's control.

     Google Identity Services renders that button into an iframe and offers no
     way to restyle it, and no supported way to trigger the ID-token flow from
     a button of our own. Overlaying keeps the verified-token flow exactly as
     it was while the card gets the design it asks for. */
  if (variant === 'tile') {
    const off = !clientId || unavailable || Boolean(misconfigured);
    return (
      <div className={`nx-card__social-btn nx-oauth${off ? ' is-off' : ''}`}>
        <GoogleMark size={17} />
        <span>Google</span>
        {off ? null : <div className="nx-oauth__real" ref={holder} />}
        {off && (
          <span className="nx-oauth__why" role="note">
            {misconfigured === 'invalid_client'
              ? 'Google does not recognise this GOOGLE_CLIENT_ID.'
              : misconfigured === 'unregistered_origin'
                ? 'This address is not an authorised origin on the Google OAuth client.'
                : unavailable
                  ? 'Google sign-in could not load — check any ad blocker.'
                  : 'Google sign-in is not configured on this server.'}
          </span>
        )}
      </div>
    );
  }

  if (!clientId) return null;

  return (
    <div className="google-signin-block">
      <div className="google-signin-divider"><span>or</span></div>
      {unavailable ? (
        <p className="google-signin-unavailable">
          Google sign-in could not load. Check your connection or any ad blocker, and use your
          username and password in the meantime.
        </p>
      ) : (
        <div className="google-signin-button" ref={holder} />
      )}
    </div>
  );
}
