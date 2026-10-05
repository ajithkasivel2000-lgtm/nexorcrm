import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, KeyRound, Lock, Mail, X } from 'lucide-react';
import GoogleSignIn from '../components/GoogleSignIn';
import MicrosoftSignIn from './MicrosoftSignIn';
import useAuthProviders from './useAuthProviders';

/**
 * The sign-in card.
 *
 * Presentation and local field state only. The submit, the error and the busy
 * flag belong to App.jsx, which owns the session — so this can be restyled
 * without going near the auth logic.
 *
 * One form: username or email, and password. Usernames are unique across
 * companies, so the general sign-in page needs no company code; a company's
 * own page (its link or domain) signs in to that company only.
 *
 * Beneath the divider, Google and Microsoft are real — each mints an ID token
 * with the vendor's own UI, which the server verifies against that vendor's
 * public keys before issuing an ordinary session. Both turn themselves off,
 * with the reason, when the server reports no client id for them. SSO is the
 * one that has nothing behind it: it is not a single protocol, and which one
 * it should be depends on the identity provider.
 */

export default function SignInCard({
  theme,
  brandName,
  welcomeTitle,
  username, onUsernameChange,
  password, onPasswordChange,
  rememberMe, onRememberChange,
  isLoading,
  error,
  notice,
  noticeTone = 'info',
  onSubmit,
  onForgot,
  onError,
  onBusyChange,
  formRef,
}) {
  const [showPassword, setShowPassword] = useState(false);
  const providers = useAuthProviders();
  /* A provider that IS configured but that the vendor then rejects — a client
     id Google has never heard of, an origin not on the allow-list. Google only
     says so on its own error page, which reads as "the app is broken". */
  const [configProblem, setConfigProblem] = useState('');

  return (
    <div className="nx-card">
      <h2 className="nx-card__title">{welcomeTitle || 'Welcome Back'}</h2>
      <p className="nx-card__sub">Sign in to your {brandName || 'NexorCRM'} account</p>

      {notice && <p className={`nx-card__banner is-${noticeTone}`}>{notice}</p>}
      {error && <p className="nx-card__banner is-error" role="alert">{error}</p>}

      <form onSubmit={onSubmit} className="nx-card__form" ref={formRef}>
        <div className="nx-card__field-group">
          <label htmlFor="login-username" className="nx-card__label">Username / Email</label>
          <div className="nx-card__field">
            <Mail size={17} className="nx-card__field-icon" aria-hidden="true" />
            <input
              id="login-username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="Enter your email or username"
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              required
              autoFocus
            />
            {username && (
              <button
                type="button"
                className="nx-card__field-btn"
                onClick={() => onUsernameChange('')}
                aria-label="Clear"
                tabIndex={-1}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="nx-card__field-group">
          <label htmlFor="login-password" className="nx-card__label">Password</label>
          <div className="nx-card__field">
            <Lock size={17} className="nx-card__field-icon" aria-hidden="true" />
            <input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              required
            />
            <button
              type="button"
              className="nx-card__field-btn"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        <div className="nx-card__row">
          {/* Ticked, the token lands in localStorage and the session row
                  lives for the configured cookie expiry; unticked it dies with
                  the tab. See utils/sessionStore.js. */}
          <label className="nx-card__check">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => onRememberChange(e.target.checked)}
            />
            <span className="nx-card__box" aria-hidden="true" />
            Remember me
          </label>
          <button type="button" className="nx-card__link" onClick={onForgot}>
            Forgot Password?
          </button>
        </div>

        <button type="submit" className="nx-card__submit" disabled={isLoading}>
          {isLoading ? 'Signing in…' : <>Sign In <ArrowRight size={18} /></>}
        </button>
      </form>

      <div className="nx-card__or"><span>or continue with</span></div>

      <div className="nx-card__social">
        {/* Google is real: the tile carries Google's own control at zero
                opacity, so the ID token is minted by Google and verified by
                the server exactly as before. It turns itself off, with the
                reason, when the server reports no client id. */}
        <GoogleSignIn
          variant="tile"
          theme={theme}
          onError={onError}
          onBusyChange={onBusyChange}
          onConfigProblem={setConfigProblem}
        />

        {/* Microsoft is real too: MSAL's popup mints the ID token and
                /api/auth/microsoft verifies it against Microsoft's keys. Like
                Google, it turns itself off with the reason when the server
                reports no client id. */}
        <MicrosoftSignIn onError={onError} onBusyChange={onBusyChange} />

        {/* SSO has nothing behind it: "SSO" is not one protocol, and which
                one it should be depends on the identity provider. It says so
                on hover rather than opening a flow that would fail. */}
        <button
          type="button"
          className="nx-card__social-btn"
          disabled
          title="Single sign-on is not configured on this server yet."
        >
          <KeyRound size={16} aria-hidden="true" />
          <span>SSO</span>
        </button>
      </div>

      {/* Said out loud, not left to a tooltip. A disabled button does not
              reliably show its title in Chrome, so clicking a dimmed provider
              looked like the app was broken rather than unconfigured. */}
      {configProblem && (
        <p className="nx-card__offline" role="status">{configProblem}</p>
      )}

      {!providers.loading && !configProblem && !(providers.google && providers.microsoft) && (
        <p className="nx-card__offline" role="status">
          {[
            !providers.google && 'Google',
            !providers.microsoft && 'Microsoft',
          ].filter(Boolean).join(' and ')}
          {' '}sign-in {providers.google || providers.microsoft ? 'is' : 'are'} not
          {' '}configured on this server. Use your email or username above, or ask an
          administrator to add the client ID.
        </p>
      )}

    </div>
  );
}
