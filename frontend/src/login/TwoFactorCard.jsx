import { useState } from 'react';
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react';

/**
 * The second step of a two-factor sign-in: the 6-digit code from the
 * authenticator app, or one of the recovery codes. Same card styles as
 * SignInCard, so the two steps read as one flow.
 */
export default function TwoFactorCard({ isLoading, error, onSubmit, onBack }) {
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);

  return (
    <div className="nx-card">
      <h2 className="nx-card__title">Two-step verification</h2>
      <p className="nx-card__sub">
        {useRecovery
          ? 'Enter one of the recovery codes you saved when you set this up. Each works once.'
          : 'Enter the 6-digit code from your authenticator app.'}
      </p>

      {error && <p className="nx-card__banner is-error" role="alert">{error}</p>}

      <form className="nx-card__form" onSubmit={(e) => { e.preventDefault(); onSubmit(code.trim()); }}>
        <div className="nx-card__field">
          <ShieldCheck size={17} className="nx-card__field-icon" aria-hidden="true" />
          <input
            name="code"
            type="text"
            inputMode={useRecovery ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            placeholder={useRecovery ? 'xxxxx-xxxxx' : '123456'}
            maxLength={useRecovery ? 11 : 6}
            value={code}
            onChange={(e) => setCode(useRecovery ? e.target.value : e.target.value.replace(/\D/g, ''))}
            required
            autoFocus
            aria-label={useRecovery ? 'Recovery code' : 'Authentication code'}
          />
        </div>

        <div className="nx-card__row">
          <button type="button" className="nx-card__link" onClick={onBack}>
            <ArrowLeft size={14} aria-hidden="true" /> Back
          </button>
          <button type="button" className="nx-card__link" onClick={() => { setUseRecovery((v) => !v); setCode(''); }}>
            {useRecovery ? 'Use the authenticator code' : 'Use a recovery code'}
          </button>
        </div>

        <button type="submit" className="nx-card__submit" disabled={isLoading || (!useRecovery && code.length !== 6)}>
          {isLoading ? 'Checking…' : <>Verify <ArrowRight size={18} /></>}
        </button>
      </form>
    </div>
  );
}
