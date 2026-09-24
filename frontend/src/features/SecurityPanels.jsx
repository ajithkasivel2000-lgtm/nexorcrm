import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CalendarDays, Copy, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button, Field, Input, Pill, toast } from '../ui';
import { api, copyText } from './api';
import './features.css';

/**
 * Your own account: two-factor sign-in with an authenticator app, and your
 * private calendar feed. Shown on the Security tab of your own profile.
 */
export function TwoFactorPanel() {
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null);   // { secret, otpauthUri, qr }
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null);   // recovery codes, shown once
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api('/api/auth/2fa/status').then(setStatus).catch(() => setStatus({ enabled: false })), []);
  useEffect(() => { load(); }, [load]);

  const start = async () => {
    setBusy(true);
    try {
      const s = await api('/api/auth/2fa/setup', { method: 'POST' });
      const qr = await QRCode.toDataURL(s.otpauthUri, { margin: 1, width: 360 });
      setSetup({ ...s, qr });
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const enable = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('/api/auth/2fa/enable', { method: 'POST', body: { code } });
      setCodes(r.recoveryCodes);
      setSetup(null); setCode('');
      load();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const disable = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/api/auth/2fa/disable', { method: 'POST', body: { password } });
      setPassword('');
      toast.success('Two-factor sign-in is off.');
      load();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <section className="nx-rec-card">
      <header className="nx-rec-card__head">
        <span className="nx-rec-card__icon"><ShieldCheck size={16} /></span>
        <div className="nx-rec-card__titles">
          <h2 className="nx-rec-card__title">Two-factor sign-in</h2>
          <p className="nx-rec-card__sub">A 6-digit code from your phone on top of your password.</p>
        </div>
        {status && <Pill tone={status.enabled ? 'success' : 'neutral'} dot>{status.enabled ? 'On' : 'Off'}</Pill>}
      </header>
      <div className="nx-rec-card__body">
        {codes && (
          <div className="fx-card">
            <h3 className="fx-card__title">Save your recovery codes</h3>
            <p className="fx-card__hint">If you lose your phone, each of these signs you in once. They are shown only now.</p>
            <div className="fx-codes">{codes.map((c) => <span key={c}>{c}</span>)}</div>
            <div className="fx-card__actions">
              <Button icon={Copy} onClick={async () => (await copyText(codes.join('\n')) ? toast.success('Copied.') : toast.error('Copy failed.'))}>Copy</Button>
              <Button variant="primary" onClick={() => setCodes(null)}>I have saved them</Button>
            </div>
          </div>
        )}

        {status && !status.enabled && !setup && (
          <>
            <p className="fx-muted">Works with Google Authenticator, Microsoft Authenticator, Authy or any TOTP app.</p>
            <Button variant="primary" icon={ShieldCheck} loading={busy} onClick={start}>Set up two-factor sign-in</Button>
          </>
        )}

        {setup && (
          <form onSubmit={enable}>
            <p className="fx-muted">1. Scan this with your authenticator app (or type the key). 2. Enter the code it shows.</p>
            {/* White behind the QR code whatever the theme: phones cannot read it on dark. */}
            <div className="fx-qr"><img src={setup.qr} alt="QR code for your authenticator app" /></div>
            <p className="fx-muted" style={{ wordBreak: 'break-all' }}>Key: <code>{setup.secret}</code></p>
            <Field label="6-digit code" required>
              <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" data-autofocus />
            </Field>
            <div className="fx-card__actions">
              <Button variant="primary" type="submit" loading={busy} disabled={code.length !== 6}>Turn on</Button>
              <Button type="button" onClick={() => setSetup(null)}>Cancel</Button>
            </div>
          </form>
        )}

        {status?.enabled && !codes && (
          <form onSubmit={disable}>
            <p className="fx-muted">{status.recoveryCodesLeft} recovery code(s) left. To turn two-factor off, confirm your password.</p>
            <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
            <div className="fx-card__actions"><Button variant="danger" type="submit" loading={busy} disabled={!password}>Turn off two-factor</Button></div>
          </form>
        )}
      </div>
    </section>
  );
}

export function CalendarPanel() {
  const [url, setUrl] = useState('');
  useEffect(() => { api('/api/calendar/link').then((r) => setUrl(r.url)).catch(() => {}); }, []);
  return (
    <section className="nx-rec-card">
      <header className="nx-rec-card__head">
        <span className="nx-rec-card__icon"><CalendarDays size={16} /></span>
        <div className="nx-rec-card__titles">
          <h2 className="nx-rec-card__title">Calendar sync</h2>
          <p className="nx-rec-card__sub">Your site visits, follow-ups and tasks in Google Calendar, Outlook or Apple Calendar.</p>
        </div>
      </header>
      <div className="nx-rec-card__body">
        <p className="fx-muted">
          Google Calendar: <strong>Other calendars → + → From URL</strong>. Outlook: <strong>Add calendar → Subscribe from web</strong>.
          Keep this link private — anyone with it can see your schedule.
        </p>
        {url && (
          <div className="fx-copy">
            <code>{url}</code>
            <Button variant="ghost" size="sm" icon={Copy} aria-label="Copy" onClick={async () => (await copyText(url) ? toast.success('Copied.') : toast.error('Copy failed.'))} />
          </div>
        )}
        <div className="fx-card__actions">
          <Button icon={RefreshCw} onClick={async () => {
            if (!await window.appConfirm('Make a new link? Calendars subscribed with the old one stop updating.')) return;
            try { setUrl((await api('/api/calendar/link/rotate', { method: 'POST' })).url); toast.success('New link made.'); } catch (e) { toast.error(e.message); }
          }}>New link</Button>
        </div>
      </div>
    </section>
  );
}
