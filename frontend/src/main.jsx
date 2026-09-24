import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import CrashNotice from './components/CrashNotice'

/* Error monitoring: only when the build sets VITE_SENTRY_DSN. Crashes in the
   browser are reported with no form data or tokens attached. */
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
  })
}
import './index.css'
import './ui/tokens.css'
import './ui/legacy-modal.css'
import App from './App.jsx'
import { ToastHost } from './ui/Toast.jsx'
import installApiAuth from './utils/apiAuth.js'

// Must run before any component fetches, so protected API calls carry the user.
installApiAuth()

// Catch 404s for old JS or CSS chunks globally (the official Vite way)
window.addEventListener('vite:preloadError', () => {
  const lastReload = Number(sessionStorage.getItem('vite-last-reload') || 0);
  // Only auto-reload if we haven't reloaded in the last 5 seconds.
  // This breaks infinite reload loops if a chunk is permanently missing.
  if (Date.now() - lastReload > 5000) {
    sessionStorage.setItem('vite-last-reload', Date.now());
    window.location.reload();
  }
});


createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* A crash in one screen shows this instead of a blank page (and is
        reported when Sentry is on). */}
    <Sentry.ErrorBoundary fallback={<CrashNotice />}>
      <App />
    </Sentry.ErrorBoundary>
    {/* Mounted beside App rather than inside it: App returns early for the
        signed-out view, and a toast raised on the login screen still has to
        land somewhere. */}
    <ToastHost />
  </StrictMode>,
)
