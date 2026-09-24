import { useId } from 'react';
import focusNextField, { isPlainEnter } from './focusNextField';
import { AlertCircle } from 'lucide-react';
import { FieldContext, useField } from './fieldContext';
import './Form.css';

/**
 * Wraps one form control with its label, hint and error message.
 *
 * <Field label="Mobile" required error={errors.mobile} hint="10 digits">
 *   <Input name="mobile" />
 * </Field>
 */
export function Field({ label, hint, error, required = false, children, className = '' }) {
  const autoId = useId();
  const id = `nx-f-${autoId}`;
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean).join(' ') || undefined;

  return (
    <FieldContext.Provider value={{ id, hasError: !!error, describedBy }}>
      <div className={`nx-field ${error ? 'has-error' : ''} ${className}`.trim()}>
        {label && (
          <label className="nx-field__label" htmlFor={id}>
            {label}
            {required && <span className="nx-field__required" aria-hidden="true">*</span>}
          </label>
        )}
        {children}
        {/* Error wins over hint so the two never stack and shift the layout. */}
        {error ? (
          <p className="nx-field__error" id={`${id}-error`} role="alert">
            <AlertCircle size={13} aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : hint ? (
          <p className="nx-field__hint" id={`${id}-hint`}>{hint}</p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

export function Input({
  size = 'md',
  prefix: Prefix,
  className = '',
  /* Enter steps to the next field, as it does on the record screens. On the
     last field of a form the key is left alone, so the form still submits —
     which is how Enter-to-save keeps working in a two-field modal. */
  enterAdvances = true,
  onKeyDown,
  ...rest
}) {
  const { id, hasError, describedBy } = useField();

  const handleKeyDown = (e) => {
    onKeyDown?.(e);
    // A caller that handled Enter itself (submitOnEnter, say) has already had
    // its turn and said so; do not also walk away from the field.
    if (e.defaultPrevented) return;
    if (!enterAdvances || !isPlainEnter(e)) return;
    if (focusNextField(e.currentTarget)) e.preventDefault();
  };

  return (
    <div className={`nx-input-wrap nx-input-wrap--${size} ${Prefix ? 'has-prefix' : ''}`}>
      {Prefix && <Prefix size={15} className="nx-input__icon" aria-hidden="true" />}
      <input
        id={id}
        className={`nx-input ${className}`.trim()}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy}
        onKeyDown={handleKeyDown}
        {...rest}
      />
    </div>
  );
}

export function Textarea({ rows = 4, className = '', ...rest }) {
  const { id, hasError, describedBy } = useField();
  return (
    <textarea
      id={id}
      rows={rows}
      className={`nx-input nx-textarea ${className}`.trim()}
      aria-invalid={hasError || undefined}
      aria-describedby={describedBy}
      {...rest}
    />
  );
}

export function Checkbox({ label, className = '', ...rest }) {
  const autoId = useId();
  const id = rest.id || `nx-cb-${autoId}`;
  return (
    <label className={`nx-checkbox ${className}`.trim()} htmlFor={id}>
      <input type="checkbox" id={id} className="nx-checkbox__input" {...rest} />
      <span className="nx-checkbox__box" aria-hidden="true" />
      {label && <span className="nx-checkbox__label">{label}</span>}
    </label>
  );
}

export function Switch({ label, className = '', ...rest }) {
  const autoId = useId();
  const id = rest.id || `nx-sw-${autoId}`;
  return (
    <label className={`nx-switch ${className}`.trim()} htmlFor={id}>
      <input type="checkbox" role="switch" id={id} className="nx-switch__input" {...rest} />
      <span className="nx-switch__track" aria-hidden="true">
        <span className="nx-switch__thumb" />
      </span>
      {label && <span className="nx-switch__label">{label}</span>}
    </label>
  );
}

/** Responsive form grid. `columns` collapses to 1 on narrow screens. */
export function FormGrid({ columns = 2, children, className = '' }) {
  return (
    <div className={`nx-form-grid nx-form-grid--${columns} ${className}`.trim()}>
      {children}
    </div>
  );
}
