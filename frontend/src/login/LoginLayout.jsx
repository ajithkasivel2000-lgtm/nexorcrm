import { useState } from 'react';
import {
  BarChart3, Building2, ClipboardCheck, Clock, Filter, Globe, Moon,
  Settings2, ShieldCheck, Sun, Users, UsersRound,
} from 'lucide-react';
import './login.css';

/**
 * The signed-out shell: marketing on the left, the sign-in card on the right.
 *
 * Everything here is presentation except the theme toggle. The card itself —
 * the fields, the validation, the request — stays in App.jsx, which owns the
 * auth state; this only gives it a place to sit. That split is what keeps the
 * login form from being rewritten every time the surrounding page changes.
 *
 * On a narrow screen the left panel is dropped rather than stacked. It is an
 * advertisement, and a person on a phone is here to sign in.
 */

/** What the left panel offers. Grouped so the top nav has something to point at. */
const FEATURES = [
  { icon: Users, label: 'Customer Management', group: 'people' },
  { icon: Filter, label: 'Lead & Opportunity Tracking', group: 'process' },
  { icon: BarChart3, label: 'Advanced Analytics', group: 'performance' },
  { icon: ClipboardCheck, label: 'Project Management', group: 'process' },
  { icon: UsersRound, label: 'Team Collaboration', group: 'people' },
  { icon: Settings2, label: 'Business Automation', group: 'growth' },
];

const NAV = [
  { id: 'people', label: 'People' },
  { id: 'process', label: 'Process' },
  { id: 'performance', label: 'Performance' },
  { id: 'growth', label: 'Growth' },
];

export default function LoginLayout({ theme, onToggleTheme, version = '1.0.0', brand = null, children }) {
  /* The nav highlights the cards it names rather than navigating. There is no
     marketing site behind these words — making them look like links to one
     would be the dishonest option, and making them inert would be worse. */
  const [highlight, setHighlight] = useState(null);
  const [langOpen, setLangOpen] = useState(false);

  const dark = theme !== 'light';
  // A company's own sign-in page (?company=slug, or its own domain) shows its
  // logo, or its name when it has not uploaded one.
  const logo = brand?.logoUrl || (dark ? '/logo_light.png' : '/logo_dark.png');

  return (
    <div className={`nx-login ${dark ? 'is-dark' : 'is-light'}`}>
      <div className="nx-login__scene" aria-hidden="true" />

      <header className="nx-login__top">
        {brand && !brand.logoUrl
          ? <span className="nx-login__brandname">{brand.name}</span>
          : <img src={logo} alt={brand?.name || 'NexorCRM'} className="nx-login__logo" />}

        <nav className="nx-login__nav" aria-label="What NexorCRM does">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`nx-login__navlink ${highlight === n.id ? 'is-on' : ''}`}
              aria-pressed={highlight === n.id}
              onClick={() => setHighlight((cur) => (cur === n.id ? null : n.id))}
            >
              {n.label}
            </button>
          ))}
        </nav>

        <div className="nx-login__tools">
          <button
            type="button"
            className="nx-login__icon-btn"
            onClick={onToggleTheme}
            aria-label={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
            title={dark ? 'Light theme' : 'Dark theme'}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <div className="nx-login__lang">
            <button
              type="button"
              className="nx-login__icon-btn nx-login__icon-btn--wide"
              onClick={() => setLangOpen((v) => !v)}
              aria-expanded={langOpen}
            >
              <Globe size={16} />
              <span>English</span>
            </button>
            {langOpen && (
              <div className="nx-login__lang-pop" role="status">
                NexorCRM is English-only for now. Other languages are not translated yet.
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="nx-login__main">
        <section className="nx-login__pitch">
          <p className="nx-login__eyebrow">Welcome to</p>
          <h1 className="nx-login__wordmark">
            <span>Nexor</span><strong>CRM</strong>
          </h1>
          <p className="nx-login__tagline">an innovative crm</p>
          <span className="nx-login__rule" />
          <p className="nx-login__blurb">
            Manage your leads, customers, projects and teams in one powerful platform.
          </p>

          <ul className="nx-login__features">
            {FEATURES.map(({ icon: Icon, label, group }) => (
              <li
                key={label}
                className={`nx-login__feature ${highlight && highlight === group ? 'is-on' : ''} ${highlight && highlight !== group ? 'is-dim' : ''}`}
              >
                <Icon size={20} aria-hidden="true" />
                <span>{label}</span>
              </li>
            ))}
          </ul>

          <blockquote className="nx-login__quote">
            <p>Smarter Relationships.<br /><em>Stronger Growth.</em></p>
            <cite>Nexor CRM</cite>
          </blockquote>
        </section>

        <section className="nx-login__panel">{children}</section>
      </main>

      {/* The mockup's "Privacy Policy · Terms · Contact Support" are not here:
          there are no such pages to link to, and a footer of links that go
          nowhere is worse than a footer without them. Pass the URLs in and
          they belong back. */}
      <footer className="nx-login__foot">
        <ul className="nx-login__promises">
          <li><Clock size={14} aria-hidden="true" />24/7 Support</li>
          <li><ShieldCheck size={14} aria-hidden="true" />Secure &amp; Reliable</li>
          <li><Building2 size={14} aria-hidden="true" />Trusted by growing businesses</li>
          <li><Settings2 size={14} aria-hidden="true" />Version {version}</li>
        </ul>
        <p className="nx-login__copy">© {new Date().getFullYear()} Nexor CRM. All rights reserved.</p>
      </footer>
    </div>
  );
}
