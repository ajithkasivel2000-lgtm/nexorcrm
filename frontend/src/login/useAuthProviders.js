import { useEffect, useState } from 'react';

/**
 * Which federated sign-ins this server actually offers.
 *
 * One fetch for the whole login card. The Google and Microsoft tiles each used
 * to ask /api/auth/providers for themselves, which was two requests for one
 * answer and gave the card no way to say anything about the pair of them.
 *
 * The answer is cached for the life of the page: it cannot change without the
 * server restarting, and the login screen is not long-lived.
 */

let cached = null;
let inFlight = null;

function load() {
  if (cached) return Promise.resolve(cached);
  if (inFlight) return inFlight;
  inFlight = fetch('/api/auth/providers')
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      cached = data || {};
      return cached;
    })
    .catch(() => {
      /* The server being unreachable is not the same as a provider being
         switched off, but from here they look alike and password sign-in is
         unaffected either way. Treat it as "nothing configured". */
      cached = {};
      return cached;
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}

/**
 * @returns {{ loading: boolean, google: boolean, googleClientId: string|null,
 *             microsoft: boolean, microsoftClientId: string|null }}
 */
export default function useAuthProviders() {
  const [state, setState] = useState(() => (cached ? { loading: false, ...cached } : { loading: true }));

  useEffect(() => {
    let cancelled = false;
    load().then((data) => { if (!cancelled) setState({ loading: false, ...data }); });
    return () => { cancelled = true; };
  }, []);

  return {
    loading: Boolean(state.loading),
    google: Boolean(state.google),
    googleClientId: state.googleClientId || null,
    microsoft: Boolean(state.microsoft),
    microsoftClientId: state.microsoftClientId || null,
  };
}
