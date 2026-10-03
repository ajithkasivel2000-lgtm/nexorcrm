import { useEffect, useState } from 'react';
import { Button, Field, Input, Page, toast } from '../ui';
import { api } from './api';
import './features.css';

/**
 * Settings → Login Layout.
 *
 * Edits the three text fields on this company's branded sign-in page
 * (/?company=<slug> or the company's own domain):
 *   - heading       — big name shown next to the logo
 *   - tagline       — one-line pitch under the heading
 *   - welcomeTitle  — "Welcome Back" on the sign-in card
 *
 * The logo and brand colour stay on the Branding card (Integrations). Any
 * field left blank falls back to the hardcoded default in CompanyLoginLayout
 * / SignInCard — so clearing a field returns to the stock copy.
 */
export default function LoginLayoutPage() {
  const allowed = ['Admin', 'superadmin'].includes(localStorage.getItem('userStatus'));
  if (!allowed) {
    return <Page title="Login Layout"><p className="fx-muted">Only administrators can edit login layout.</p></Page>;
  }
  return <LoginLayoutInner />;
}

function LoginLayoutInner() {
  const [brand, setBrand] = useState(null);
  const [heading, setHeading] = useState('');
  const [tagline, setTagline] = useState('');
  const [welcomeTitle, setWelcomeTitle] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/branding').then((b) => {
      setBrand(b);
      setHeading(b?.loginContent?.heading || '');
      setTagline(b?.loginContent?.tagline || '');
      setWelcomeTitle(b?.loginContent?.welcomeTitle || '');
    }).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const loginContent = {
        heading: heading.trim(),
        tagline: tagline.trim(),
        welcomeTitle: welcomeTitle.trim(),
      };
      const updated = await api('/api/company/branding', { method: 'PUT', body: { loginContent } });
      setBrand(updated);
      toast.success('Saved. Open your branded sign-in page to see it.');
    } catch (e) {
      toast.error(e.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setHeading(''); setTagline(''); setWelcomeTitle('');
    setBusy(true);
    try {
      const updated = await api('/api/company/branding', { method: 'PUT', body: { loginContent: null } });
      setBrand(updated);
      toast.success('Back to the default copy.');
    } catch (e) {
      toast.error(e.message || 'Could not reset.');
    } finally {
      setBusy(false);
    }
  };

  if (!brand) return <Page title="Login Layout"><p className="fx-muted">Loading…</p></Page>;

  return (
    <Page title="Login Layout">
      <div className="fx-card">
        <h3 className="fx-card__title">Branded sign-in text</h3>
        <p className="fx-card__hint">
          Shown on your company's sign-in page. Leave a field blank to use the default.
          Your logo and colour are set on the <strong>Integrations → Branding</strong> card.
        </p>

        <div style={{ marginTop: 'var(--nx-space-4)', maxWidth: 560, display: 'grid', gap: 'var(--nx-space-4)' }}>
          <Field label="Heading" hint={`Default: ${brand.name || 'your company name'}`}>
            <Input
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              placeholder={brand.name || 'Your company name'}
              maxLength={80}
            />
          </Field>

          <Field label="Tagline" hint="Default: Sign in to manage your leads, projects, bookings and customers.">
            <Input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="One short line under the heading"
              maxLength={160}
            />
          </Field>

          <Field label="Welcome title" hint="Default: Welcome Back">
            <Input
              value={welcomeTitle}
              onChange={(e) => setWelcomeTitle(e.target.value)}
              placeholder="Welcome Back"
              maxLength={60}
            />
          </Field>
        </div>

        <div className="fx-row" style={{ marginTop: 'var(--nx-space-4)' }}>
          <Button variant="primary" loading={busy} onClick={save}>Save</Button>
          <Button onClick={reset} disabled={busy}>Reset to defaults</Button>
        </div>

        <p className="fx-muted" style={{ marginTop: 'var(--nx-space-3)' }}>
          Preview: open <code>/?company={brand.slug}</code> in another tab after saving.
        </p>
      </div>
    </Page>
  );
}
