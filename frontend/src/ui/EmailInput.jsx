import { useEffect, useState } from 'react';
import focusNextField, { isPlainEnter } from './focusNextField';
import { Mail } from 'lucide-react';
import { emailError, normalizeEmail } from './email';
import './EmailInput.css';

/**
 * One email field for the whole application.
 *
 * Every screen used to roll its own `<input type="email">`, which is a weaker
 * check than it looks — browsers accept `a@b` and `x@localhost`. This validates
 * against the same rule the server uses, shows the problem where the user is
 * looking, and normalises the value (trim + lowercase) so the same address
 * typed two ways does not become two contacts.
 *
 * Uncontrolled-friendly: the current value is always in a real named input, so
 * a plain `new FormData(form)` picks it up without the form owning any state.
 *
 *   <EmailInput name="email" required />
 *   <EmailInput name="email" value={v} onChange={setV} label="Email" />
 *
 * Errors surface on blur, not on every keystroke — flagging "not a valid
 * address" while someone is still typing the domain is noise, not help.
 */
export default function EmailInput({
  name = 'email',
  value,
  defaultValue = '',
  onChange,
  onValidityChange,
  required = false,
  disabled = false,
  readOnly = false,
  placeholder = 'name@example.com',
  label = 'Email',
  id,
  className = '',
  // Defaults to off: nearly every address in this CRM belongs to someone
  // other than the person typing it. Pass "email" for the user's own.
  autoComplete = 'off',
  onKeyDown,
  /* Enter steps to the next field, as everywhere else. */
  enterAdvances = true,
}) {
  const controlled = value !== undefined;
  const [draft, setDraft] = useState(controlled ? value : defaultValue);
  const [touched, setTouched] = useState(false);

  useEffect(() => { if (controlled) setDraft(value ?? ''); }, [controlled, value]);

  const current = controlled ? (value ?? '') : draft;
  const error = touched ? emailError(current, { required, label }) : '';

  const update = (next) => {
    if (!controlled) setDraft(next);
    if (onChange) onChange(next);
    if (onValidityChange) onValidityChange(emailError(next, { required, label }) === '');
  };

  /* Enter steps to the next field. The blur handler that normalises the
     address runs first, because moving focus away is what fires it. */
  const handleKeyDown = (e) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (!enterAdvances || !isPlainEnter(e)) return;
    if (focusNextField(e.currentTarget)) e.preventDefault();
  };

  return (
    <div className={`nx-email ${error ? 'has-error' : ''} ${className}`.trim()}>
      <div className="nx-email__control">
        <Mail size={15} className="nx-email__icon" aria-hidden="true" />
        <input
          id={id}
          className="nx-email__input"
          type="email"
          name={name}
          value={current}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          readOnly={readOnly}
          autoComplete={autoComplete}
          spellCheck="false"
          autoCapitalize="none"
          aria-invalid={error ? true : undefined}
          aria-describedby={error && id ? `${id}-error` : undefined}
          onChange={(e) => update(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={(e) => {
            setTouched(true);
            // Commit the canonical form once the user leaves the field, so what
            // is stored matches what the server would store anyway.
            const cleaned = normalizeEmail(e.target.value);
            if (cleaned !== e.target.value) update(cleaned);
          }}
        />
      </div>
      {error && (
        <p className="nx-email__error" id={id ? `${id}-error` : undefined} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
