import { useState } from 'react';
import { ArrowRight, Building2, ChevronRight, Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck, Smartphone, X } from 'lucide-react';
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
 * Three sign-in methods are drawn because the design asks for three. Only the
 * first exists: POST /api/auth/login takes a username or an email and a
 * password, and there is no mobile-number or per-company sign-in behind it.
 * The other two are shown disabled with the reason, rather than wired to a
 * form that would collect a number and then fail.
 *
 * Beneath the divider, Google and Microsoft are real — each mints an ID token
 * with the vendor's own UI, which the server verifies against that vendor's
 * public keys before issuing an ordinary session. Both turn themselves off,
 * with the reason, when the server reports no client id for them. SSO is the
 * one that has nothing behind it: it is not a single protocol, and which one
 * it should be depends on the identity provider.
 */

const METHODS = [
  { id: 'password', label: 'Email / Username', icon: Mail, ready: true },
  { id: 'mobile', label: 'Mobile Number', icon: Smartphone, ready: false, why: 'Signing in with a mobile number is not set up on this server yet.' },
  { id: 'company', label: 'Company Login', icon: Building2, ready: false, why: 'Per-company sign-in is not set up on this server yet.' },
];

export default function SignInCard({
  theme,
  brandName,
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
  const [method, setMethod] = useState('password');
  const [showPassword, setShowPassword] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const providers = useAuthProviders();
  /* A provider that IS configured but that the vendor then rejects — a client
     id Google has never heard of, an origin not on the allow-list. Google only
     says so on its own error page, which reads as "the app is broken". */
  const [configProblem, setConfigProblem] = useState('');
  const unavailable = METHODS.find((m) => m.id === method && !m.ready);

  return (
    <div className="nx-card">
      <h2 className="nx-card__title">Welcome Back</h2>
      <p className="nx-card__sub">Sign in to your {brandName || 'NexorCRM'} account</p>

      <div className="nx-card__tabs" role="tablist" aria-label="Sign-in method">
        {METHODS.map(({ id, label, icon: Icon, ready, why }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={method === id}
            /* Below 560px the label is hidden and only the icon shows, so the
               name has to live on the button itself or the tab is unreadable
               to a screen reader exactly where it is unreadable to everyone. */
            aria-label={label}
            className={`nx-card__tab ${method === id ? 'is-on' : ''} ${ready ? '' : 'is-pending'}`}
            title={ready ? label : why}
            onClick={() => setMethod(id)}
          >
            <Icon size={13} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {notice && <p className={`nx-card__banner is-${noticeTone}`}>{notice}</p>}
      {error && <p className="nx-card__banner is-error" role="alert">{error}</p>}

      {unavailable ? (
        <div className="nx-card__pending" role="status">
          <p>{unavailable.why}</p>
          <button type="button" className="nx-card__link" onClick={() => setMethod('password')}>
            Sign in with your email or username instead
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={onSubmit} className="nx-card__form" ref={formRef}>
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

          <p className="nx-card__secure">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>Your data is secure with enterprise-grade protection</span>
            <button
              type="button"
              className="nx-card__link nx-card__more"
              aria-expanded={showSecurity}
              onClick={() => setShowSecurity((v) => !v)}
            >
              Learn more
              <ChevronRight size={14} aria-hidden="true" className={showSecurity ? 'is-open' : ''} />
            </button>
          </p>

          {/* What this install actually does, not a marketing page — there is
              no such page to link to, and these four are true of the code. */}
          {showSecurity && (
            <ul className="nx-card__secure-list">
              <li>Passwords are stored as bcrypt hashes, never in plain text.</li>
              <li>Signing in creates a server-side session; every request is checked against it.</li>
              <li>An administrator ending a session cuts off access immediately.</li>
              <li>Repeated failed sign-ins lock the account for a period.</li>
            </ul>
          )}

        </>
      )}
    </div>
  );
}
