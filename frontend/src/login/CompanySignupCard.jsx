import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Lock, Mail, Phone, User } from 'lucide-react';

/**
 * "Start a free trial": creates a new company with you as its administrator,
 * then signs you in. Same card styles as SignInCard.
 */
export default function CompanySignupCard({ onBack, onCreated }) {
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState({ companyName: '', name: '', email: '', phone: '', username: '', password: '', planKey: 'growth' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
      await onCreated({ username: form.username, password: form.password });
    } catch {
      setError('Could not connect to the server.');
    } finally {
      setBusy(false);
    }
  };

  const field = (key, Icon, props) => (
    <div className="nx-card__field">
      <Icon size={17} className="nx-card__field-icon" aria-hidden="true" />
      <input name={key} value={form[key]} onChange={set(key)} {...props} />
    </div>
  );

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
