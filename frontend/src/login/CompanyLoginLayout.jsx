import { ArrowRight, LockKeyhole, Moon, Sun, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import './login.css';
import './company-login.css';

function inkOn(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!match) return '#ffffff';
  const value = parseInt(match[1], 16);
  const [red, green, blue] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return (0.299 * red + 0.587 * green + 0.114 * blue) > 170 ? '#0f172a' : '#ffffff';
}

const initials = (name) => String(name || '')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((word) => word[0])
  .join('')
  .toUpperCase();

const labelFromSlug = (slug) => String(slug || 'Company')
  .split(/[-_\s]+/)
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ');

function safeSupportHref(brand) {
  if (brand?.supportUrl) {
    try {
      const url = new URL(brand.supportUrl);
      if (url.protocol === 'https:') return url.href;
    } catch {
      return null;
    }
  }
  if (brand?.supportEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brand.supportEmail)) {
    return `mailto:${brand.supportEmail}`;
  }
  return null;
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export default function CompanyLoginLayout({
  theme,
  onToggleTheme,
  brand,
  companySlug,
  unavailable = false,
  children,
}) {
  const dark = theme === 'dark';
  const name = brand?.name || labelFromSlug(companySlug);
  const accent = brand?.brandColor || '#2563eb';
  const logo = dark
    ? (brand?.logoDarkUrl || brand?.logoUrl)
    : (brand?.logoUrl || brand?.logoDarkUrl);
  const supportHref = safeSupportHref(brand);
  const privacyUrl = safeHttpsUrl(brand?.privacyUrl);
  const termsUrl = safeHttpsUrl(brand?.termsUrl);
  const showPoweredBy = brand?.showPoweredBy !== false;
  const poweredByText = brand?.poweredByText || 'Powered by Infitoolz';
  const style = { '--co-accent': accent, '--co-on-accent': inkOn(accent) };
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [supportError, setSupportError] = useState('');
  const [supportSent, setSupportSent] = useState(false);
  const [supportConfirmation, setSupportConfirmation] = useState('');
  const emailInput = useRef(null);
  const supportDialog = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    if (!supportOpen) {
      previousFocus.current?.focus();
      previousFocus.current = null;
      return undefined;
    }
    emailInput.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !supportSubmitting) setSupportOpen(false);
      if (event.key !== 'Tab') return;
      const focusable = supportDialog.current?.querySelectorAll(
        'button:not(:disabled), input:not(:disabled):not([tabindex="-1"]), textarea:not(:disabled)',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [supportOpen, supportSubmitting]);

  const openSupport = () => {
    previousFocus.current = document.activeElement;
    setSupportError('');
    setSupportSent(false);
    setSupportConfirmation('');
    setSupportOpen(true);
  };

  const submitSupport = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = {
      email: form.email.value.trim(),
      topic: form.topic.value,
      message: form.message.value.trim(),
      companySlug,
      website: form.website.value,
    };
    setSupportSubmitting(true);
    setSupportError('');
    try {
      const response = await fetch('/api/public/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not send your request. Please try again.');
      setSupportConfirmation(data.message || 'Your support request was sent.');
      setSupportSent(true);
    } catch (error) {
      setSupportError(error.message || 'Could not send your request. Please try again.');
    } finally {
      setSupportSubmitting(false);
    }
  };

  return (
    <div className={`nx-login nx-colog ${dark ? 'is-dark' : 'is-light'}`} style={style}>
      <div className="nx-login__scene" aria-hidden="true" />

      <header className="nx-colog__top">
        <div className="nx-colog__identity">
          {logo
            ? <img src={logo} alt={`${name} logo`} />
            : <span className="nx-colog__initials" aria-hidden="true">{initials(name)}</span>}
          <div className="nx-colog__identity-copy">
            <strong>{name}</strong>
            <span>Workspace</span>
          </div>
        </div>
        <button
          type="button"
          className="nx-colog__theme"
          onClick={onToggleTheme}
          aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
          title={dark ? 'Light theme' : 'Dark theme'}
        >
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </header>

      <main className="nx-colog__main">
        <aside className="nx-colog__visual" aria-label={`${name} workspace`}>
          <div className="nx-colog__visual-copy">
            <span className="nx-colog__eyebrow">Your workspace</span>
            <h1>{brand?.loginContent?.heading || name}</h1>
            <p>{brand?.loginContent?.tagline || 'A secure place for your team to work together.'}</p>
          </div>
          <div className="nx-colog__visual-art" aria-hidden="true">
            <span className="nx-colog__art-orbit nx-colog__art-orbit--outer" />
            <span className="nx-colog__art-orbit nx-colog__art-orbit--inner" />
            <span className="nx-colog__art-core" />
            <span className="nx-colog__art-node nx-colog__art-node--one" />
            <span className="nx-colog__art-node nx-colog__art-node--two" />
            <span className="nx-colog__art-node nx-colog__art-node--three" />
          </div>
        </aside>

        <section className="nx-colog__form-panel">
          {unavailable ? (
            <div className="nx-colog__unavailable" role="status">
              <span className="nx-colog__status-label">Workspace access</span>
              <h2>Workspace unavailable</h2>
              <p>
                We couldn’t open this workspace right now.
                {' '}The company link may be invalid, or workspace access may be temporarily unavailable.
              </p>
              <div className="nx-colog__status-actions">
                <button className="nx-colog__action nx-colog__action--primary" type="button" onClick={() => window.location.reload()}>
                  Try again <ArrowRight size={16} aria-hidden="true" />
                </button>
                <a className="nx-colog__action nx-colog__action--secondary" href="/">Back to NexorCRM</a>
              </div>
              <div className="nx-colog__unavailable-help">
                <span>Need help?</span>
                <button className="nx-colog__support" type="button" onClick={openSupport}>Contact support</button>
              </div>
            </div>
          ) : children}
        </section>
      </main>

      <footer className="nx-colog__foot">
        <span className="nx-colog__footer-trust"><LockKeyhole size={14} aria-hidden="true" /> Secure workspace</span>
        {!unavailable && (
          <>
            <nav className="nx-colog__legal" aria-label="Workspace information">
              {privacyUrl && <a href={privacyUrl} target="_blank" rel="noreferrer">Privacy</a>}
              {termsUrl && <a href={termsUrl} target="_blank" rel="noreferrer">Terms</a>}
              {supportHref && <a href={supportHref} target={supportHref.startsWith('https:') ? '_blank' : undefined} rel={supportHref.startsWith('https:') ? 'noreferrer' : undefined}>Support</a>}
            </nav>
            {showPoweredBy && <span>{brand?.poweredByLogo ? <img src={brand.poweredByLogo} alt={poweredByText} /> : poweredByText}</span>}
          </>
        )}
      </footer>

      {supportOpen && (
        <div className="nx-colog__support-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !supportSubmitting) setSupportOpen(false);
        }}>
          <section ref={supportDialog} className="nx-colog__support-dialog" role="dialog" aria-modal="true" aria-labelledby="nx-colog-support-title" aria-describedby="nx-colog-support-description">
            <header className="nx-colog__support-heading">
              <h2 id="nx-colog-support-title">{supportSent ? 'Request received' : 'Need help?'}</h2>
              <button
                className="nx-colog__support-close"
                type="button"
                onClick={() => setSupportOpen(false)}
                aria-label="Close support form"
                disabled={supportSubmitting}
              >
                <X size={19} aria-hidden="true" />
              </button>
            </header>
            {supportSent ? (
              <div className="nx-colog__support-success" role="status">
                <p id="nx-colog-support-description">{supportConfirmation} The application owner can use your email address to reply.</p>
                <button className="nx-colog__action nx-colog__action--primary" type="button" onClick={() => setSupportOpen(false)}>Done</button>
              </div>
            ) : (
              <>
                <p id="nx-colog-support-description" className="nx-colog__support-intro">
                  We’re here to help you access your workspace.
                </p>
                <form className="nx-colog__support-form" onSubmit={submitSupport}>
                  <fieldset className="nx-colog__support-topics" disabled={supportSubmitting}>
                    <legend>What do you need help with?</legend>
                    {['Workspace access', 'Login problem', 'Company link problem', 'Other'].map((topic, index) => (
                      <label key={topic}>
                        <input type="radio" name="topic" value={topic} defaultChecked={index === 0} />
                        <span>{topic}</span>
                      </label>
                    ))}
                  </fieldset>
                  <label className="nx-colog__support-field">
                    Your email
                    <input ref={emailInput} type="email" name="email" autoComplete="email" maxLength={254} placeholder="your@email.com" required disabled={supportSubmitting} />
                  </label>
                  <label className="nx-colog__support-field">
                    Message
                    <textarea name="message" rows={4} maxLength={5000} placeholder="Describe your issue..." required disabled={supportSubmitting} />
                  </label>
                  <label className="nx-colog__support-honeypot" aria-hidden="true">
                    Website
                    <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                  {supportError && <p className="nx-colog__support-error" role="alert">{supportError}</p>}
                  <div className="nx-colog__support-actions">
                    <button className="nx-colog__action nx-colog__action--secondary" type="button" onClick={() => setSupportOpen(false)} disabled={supportSubmitting}>Cancel</button>
                    <button className="nx-colog__action nx-colog__action--primary" type="submit" disabled={supportSubmitting}>
                      {supportSubmitting ? 'Sending…' : 'Contact Support'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
