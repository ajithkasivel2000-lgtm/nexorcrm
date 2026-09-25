import { Moon, Sun } from 'lucide-react';
import './login.css';
import './company-login.css';

/**
 * A client company's own sign-in page (its domain, or ?company=<code>).
 *
 * Deliberately not the platform's page with a logo swapped in: no NexorCRM
 * marketing, menu or free-trial offer, just the company — its colour, logo
 * and name — and the sign-in card. The card and everything behind it are the
 * same as on the platform page (App.jsx owns them); only the frame differs.
 *
 * It sits inside .nx-login so the card keeps its styling and theme, with the
 * accent variables set to the company's colour.
 */

/** A readable text colour (black or white) on a hex background. */
function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? '#0f172a' : '#ffffff';
}

const initials = (name) => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export default function CompanyLoginLayout({ theme, onToggleTheme, brand, children }) {
  const dark = theme !== 'light';
  const accent = brand.brandColor || '#2563eb';
  const onAccent = inkOn(accent);
  const style = {
    '--lg-gold': accent,
    '--lg-gold-deep': accent,
    '--lg-gold-ink': dark ? accent : accent,
    '--co-accent': accent,
    '--co-on-accent': onAccent,
  };

  return (
    <div className={`nx-login nx-colog ${dark ? 'is-dark' : 'is-light'}`} style={style}>
      <aside className="nx-colog__brand" aria-hidden="false">
        <div className="nx-colog__brand-inner">
          <div className="nx-colog__logo">
            {brand.logoUrl
              ? <img src={brand.logoUrl} alt={`${brand.name} logo`} />
              : <span className="nx-colog__initials">{initials(brand.name)}</span>}
          </div>
          <p className="nx-colog__eyebrow">Welcome to</p>
          <h1 className="nx-colog__name">{brand.name}</h1>
          <p className="nx-colog__blurb">Sign in to manage your leads, projects, bookings and customers.</p>
        </div>
      </aside>

      <main className="nx-colog__main">
        <div className="nx-colog__top">
          {/* On a phone the colour panel is gone, so the logo and name ride here. */}
          <div className="nx-colog__mini">
            {brand.logoUrl ? <img src={brand.logoUrl} alt="" /> : <span className="nx-colog__initials is-small">{initials(brand.name)}</span>}
            <strong>{brand.name}</strong>
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
        </div>

        <section className="nx-colog__panel">{children}</section>

        <footer className="nx-colog__foot">
          <span>© {new Date().getFullYear()} {brand.name}. All rights reserved.</span>
          <span className="nx-colog__powered">Powered by NexorCRM</span>
        </footer>
      </main>
    </div>
  );
}
