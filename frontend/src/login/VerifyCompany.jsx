import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react';

/**
 * Landing page for the verification link in the signup email.
 *
 * The link looks like /verify-company?token=xxxxx. The URL reaches this
 * component because App.jsx mounts it before the auth gate when the path
 * matches — a signed-out visitor has to be able to see it.
 *
 * We call the backend once on mount. The backend is idempotent at the token
 * level (a used token no longer matches), so a refresh here lands on the
 * "already used" branch rather than re-activating anything.
 *
 * On success we offer a sign-in link that preserves ?company=<slug> so the
 * user lands on their branded page with the username they just chose
 * remembered — one less thing to type right after a verification click.
 */
export default function VerifyCompany({ onDone }) {
  const [state, setState] = useState('working'); // working | ok | gone | error
  const [data, setData] = useState({});

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setState('error');
      setData({ message: 'This verification link is missing its token.' });
      return;
    }
    fetch(`/api/public/verify-company?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (r.status === 200) { setState('ok'); setData(body); }
        else if (r.status === 410 || r.status === 404) { setState('gone'); setData(body); }
        else { setState('error'); setData(body); }
      })
      .catch(() => {
        setState('error');
        setData({ message: 'Could not reach the server. Please try the link again in a moment.' });
      });
  }, []);

  const toSignIn = () => {
    const slug = data?.slug;
    window.location.href = slug ? `/?company=${encodeURIComponent(slug)}` : '/';
    if (onDone) onDone();
  };

  if (state === 'working') {
    return (
      <div className="nx-card">
        <h2 className="nx-card__title">Verifying your account…</h2>
        <p className="nx-card__sub">One moment.</p>
      </div>
    );
  }
  if (state === 'ok') {
    return (
      <div className="nx-card">
        <div style={{ textAlign: 'center', margin: '8px 0 16px' }}>
          <CheckCircle2 size={48} aria-hidden="true" style={{ color: '#16a34a' }} />
        </div>
        <h2 className="nx-card__title" style={{ textAlign: 'center' }}>You're verified</h2>
        <p className="nx-card__sub" style={{ textAlign: 'center' }}>
          {data.companyName
            ? <>Your company <strong>{data.companyName}</strong> is active and your 14-day free trial has started.</>
            : <>Your company is active and your 14-day free trial has started.</>}
        </p>
        <button type="button" className="nx-card__submit" onClick={toSignIn} style={{ marginTop: 20 }}>
          Sign in <ArrowRight size={18} />
        </button>
      </div>
    );
  }
  // 'gone' (expired/used) and 'error' render the same shell, with the message.
  return (
    <div className="nx-card">
      <div style={{ textAlign: 'center', margin: '8px 0 16px' }}>
        <XCircle size={48} aria-hidden="true" style={{ color: '#dc2626' }} />
      </div>
      <h2 className="nx-card__title" style={{ textAlign: 'center' }}>
        {state === 'gone' ? 'Link expired or already used' : 'Something went wrong'}
      </h2>
      <p className="nx-card__sub" style={{ textAlign: 'center' }}>
        {data.message || 'Please try signing in, or sign up again if you have not activated yet.'}
      </p>
      <button type="button" className="nx-card__submit" onClick={toSignIn} style={{ marginTop: 20 }}>
        Back to sign in <ArrowRight size={18} />
      </button>
    </div>
  );
}
