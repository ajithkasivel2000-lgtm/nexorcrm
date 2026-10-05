import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Lock, Mail, MailCheck, Phone, User } from 'lucide-react';

/**
 * "Start a free trial": creates a new company with you as its administrator.
 *
 * The server replies in one of two shapes:
 *   { pending: true, email }       — email verification required (default
 *                                     flow). We show a "check your email"
 *                                     view with a resend button, and never
 *                                     call onCreated.
 *   { message, company }           — verification was skipped (test suite
 *                                     or SKIP_SIGNUP_VERIFICATION). We call
 *                                     onCreated so the parent signs the
 *                                     admin in immediately.
 */
export default function CompanySignupCard({ onBack, onCreated }) {
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState({ companyName: '', name: '', email: '', phone: '', username: '', password: '', planKey: 'growth' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /* Non-null means we are on the "check your email" screen with the shown
     address. The main form is replaced; onBack still goes back to sign-in. */
  const [pendingEmail, setPendingEmail] = useState(null);
  const [resendMsg, setResendMsg] = useState('');
  const [resendBusy, setResendBusy] = useState(false);
  /* Only populated on dev servers that have no SMTP configured — the
     backend hands the verification link back so the developer can click it
     from the browser instead of digging through logs or the DB. Never set
     by a production backend; see brandingController.signup. */
  const [devLink, setDevLink] = useState('');

  useEffect(() => {
    // The plans are shown so people know what the trial turns into.
    fetch('/api/public/plans').then((r) => (r.ok ? r.json() : [])).then(setPlans).catch(() => { });
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/public/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.message || 'Could not create your company.'); return; }
      if (data.pending) {
        /* Verification-first flow: hold here and tell them to go check
           their email. onCreated is NOT called — login would be refused
           by the backend anyway (admin status='Pending'). _devVerifyLink
           arrives only on dev servers where mail is not configured; we
           carry it to the next screen so the developer can click through
           without SMTP. */
        setPendingEmail(data.email || form.email);
        if (data._devVerifyLink) setDevLink(data._devVerifyLink);
        if (data.message) setResendMsg(data.message);
        return;
      }
      await onCreated({ username: form.username, password: form.password });
    } catch {
      setError('Could not connect to the server.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setResendBusy(true);
    setResendMsg('');
    try {
      const res = await fetch('/api/public/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail }),
      });
      const data = await res.json().catch(() => ({}));
      setResendMsg(data.message || (res.ok
        ? 'Sent. Check your inbox again.'
        : 'Could not send. Please try again in a minute.'));
    } catch {
      setResendMsg('Could not connect to the server.');
    } finally {
      setResendBusy(false);
    }
  };

  const field = (key, Icon, props) => (
    <div className="nx-card__field">
      <Icon size={17} className="nx-card__field-icon" aria-hidden="true" />
      <input name={key} value={form[key]} onChange={set(key)} {...props} />
    </div>
  );

  /* Verification waiting view. Replaces the form once the server has created
     the pending account and emailed the link. The resend button is here
     because the inbox link is the only way forward and losing the email is
     by far the most common block. */
  if (pendingEmail) {
    return (
      <div className="nx-card">
        <div style={{ textAlign: 'center', margin: '8px 0 16px' }}>
          <MailCheck size={48} aria-hidden="true" style={{ color: 'var(--nx-accent)' }} />
        </div>
        <h2 className="nx-card__title" style={{ textAlign: 'center' }}>Check your email</h2>
        <p className="nx-card__sub" style={{ textAlign: 'center' }}>
          We sent a verification link to <strong>{pendingEmail}</strong>. Click it to activate your company and start your 14-day trial.
        </p>
        <p className="nx-card__sub" style={{ textAlign: 'center', fontSize: 13, opacity: 0.75 }}>
          The link is good for 24 hours. Can't find it? Check your spam folder, or resend below.
        </p>
        {resendMsg && <p className="nx-card__banner" role="status" style={{ marginTop: 12 }}>{resendMsg}</p>}
        {devLink && (
          /* Dev-only shortcut: a prominent clickable link that the backend
             returns when SMTP is not configured. It does not appear in
             production because the server guards the field with NODE_ENV. */
          <div style={{ marginTop: 12, padding: 12, background: 'var(--nx-bg-elev, rgba(255,255,255,0.04))', borderRadius: 8, fontSize: 13 }}>
            <strong style={{ display: 'block', marginBottom: 6 }}>Dev shortcut (no SMTP configured):</strong>
            <a href={devLink} style={{ wordBreak: 'break-all', color: 'var(--nx-accent)' }}>{devLink}</a>
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button type="button" className="nx-card__link" onClick={onBack}>
            <ArrowLeft size={14} aria-hidden="true" /> Back to sign in
          </button>
          <button type="button" className="nx-card__submit" onClick={resend} disabled={resendBusy} style={{ marginLeft: 'auto' }}>
            {resendBusy ? 'Sending…' : 'Resend verification email'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="nx-card">
      <h2 className="nx-card__title">Start your free trial</h2>
      <p className="nx-card__sub">14 days, no card needed. You'll be the administrator of your company's CRM.</p>
      {error && <p className="nx-card__banner is-error" role="alert">{error}</p>}
      <form className="nx-card__form" onSubmit={submit}>
        {field('companyName', Building2, { placeholder: 'Company name', required: true, autoFocus: true, 'aria-label': 'Company name' })}
        {field('name', User, { placeholder: 'Your name', 'aria-label': 'Your name' })}
        {field('email', Mail, { type: 'email', placeholder: 'Work email', required: true, autoComplete: 'email', 'aria-label': 'Work email' })}
        {field('phone', Phone, { type: 'tel', placeholder: 'Phone (optional)', autoComplete: 'tel', 'aria-label': 'Phone' })}
        {field('username', User, { placeholder: 'Choose a username', required: true, autoComplete: 'username', 'aria-label': 'Username' })}
        {field('password', Lock, { type: 'password', placeholder: 'Password (10+ characters, a number and a symbol)', required: true, autoComplete: 'new-password', 'aria-label': 'Password' })}
        {plans.length > 0 && (
          <div className="nx-card__field">
            <select name="planKey" value={form.planKey} onChange={set('planKey')} aria-label="Plan after the trial" style={{ flex: 1, background: 'transparent', border: 0, color: 'inherit', font: 'inherit', padding: '0 12px' }}>
              {plans.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name} — ₹{(p.pricePaise / 100).toLocaleString('en-IN')}/month{p.maxUsers ? `, up to ${p.maxUsers} users` : ', unlimited users'}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="nx-card__row">
          <button type="button" className="nx-card__link" onClick={onBack}><ArrowLeft size={14} aria-hidden="true" /> Back to sign in</button>
        </div>
        <button type="submit" className="nx-card__submit" disabled={busy}>
          {busy ? 'Creating your company…' : <>Create my company <ArrowRight size={18} /></>}
        </button>
      </form>
    </div>
  );
}
