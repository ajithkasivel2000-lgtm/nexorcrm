import { useMemo, useState } from 'react';
import focusNextField, { isPlainEnter } from './focusNextField';
import { ChevronDown, Search } from 'lucide-react';
import Popover from './Popover';
import {
  COUNTRIES, DEFAULT_DIAL, countryFor, flagUrl, maxLenFor, normalizeNumber,
} from './countries';
import './PhoneInput.css';

/**
 * Phone number with a country selector.
 *
 * Controlled on two values so the dial code can be stored in its own column:
 *   <PhoneInput
 *     name="mobile" countryName="mobileCountryCode"
 *     value={mobile} dial={dial}
 *     onChange={setMobile} onDialChange={setDial}
 *   />
 *
 * Both values are also written to hidden inputs, so a plain
 * `new FormData(form)` picks them up without the form owning any state.
 */
export default function PhoneInput({
  name = 'mobile',
  countryName,
  value = '',
  dial = DEFAULT_DIAL,
  onChange,
  onDialChange,
  // Fires when the number input loses focus. Inline-edit screens use it to
  // save, the same way a plain text field commits on blur.
  onBlur,
  // Inline-edit screens save on Enter, so the key has to reach them.
  onKeyDown,
  /* Enter steps to the next field, as everywhere else. */
  enterAdvances = true,
  required = false,
  disabled = false,
  placeholder,
  // Off by default, overridable — the same shape EmailInput uses.
  autoComplete = 'off',
  id,
}) {
  const [query, setQuery] = useState('');
  const country = countryFor(dial);
  const maxLen = maxLenFor(dial);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.iso.includes(q)
    );
  }, [query]);

  const handleNumber = (e) => {
    // Digits only, capped at what this country accepts — so a paste of
    // "+91 98765 43210" lands as "9876543210" rather than being rejected.
    const digits = normalizeNumber(e.target.value, dial).slice(0, maxLen);
    onChange?.(digits);
  };

  const pick = (c, close) => {
    onDialChange?.(c.dial);
    // Re-clamp: switching to a shorter format shouldn't leave extra digits.
    onChange?.(String(value).replace(/\D/g, '').slice(0, maxLenFor(c.dial)));
    setQuery('');
    close();
  };

  const handleKeyDown = (e) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (!enterAdvances || !isPlainEnter(e)) return;
    if (focusNextField(e.currentTarget)) e.preventDefault();
  };

  return (
    <div className={`nx-phone ${disabled ? 'is-disabled' : ''}`}>
      <Popover
        align="start"
        width={280}
        trigger={({ open, toggle, ref }) => (
          <span ref={ref} className="nx-phone__anchor">
            <button
              type="button"
              className="nx-phone__country"
              onClick={toggle}
              disabled={disabled}
              aria-expanded={open}
              aria-label={`Country code: ${country.name} ${country.dial}`}
            >
              <img src={flagUrl(country.iso)} alt="" width={20} height={14} />
              <span className="nx-phone__dial">{country.dial}</span>
              <ChevronDown size={13} aria-hidden="true" />
            </button>
          </span>
        )}
      >
        {({ close }) => (
          <>
            <div className="nx-phone__search">
              <Search size={14} aria-hidden="true" />
              <input
                type="text"
                value={query}
                placeholder="Search country or code"
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search country"
                autoFocus
              />
            </div>
            <div className="nx-phone__list">
              {results.length === 0 && (
                <p className="nx-phone__empty">No country matches “{query}”.</p>
              )}
              {results.map((c) => (
                <button
                  key={`${c.iso}-${c.dial}`}
                  type="button"
                  className={`nx-phone__option ${c.dial === dial && c.iso === country.iso ? 'is-active' : ''}`}
                  onClick={() => pick(c, close)}
                >
                  <img src={flagUrl(c.iso)} alt="" width={20} height={14} />
                  <span className="nx-phone__option-name">{c.name}</span>
                  <span className="nx-phone__option-dial">{c.dial}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </Popover>

      <input
        id={id}
        type="tel"
        inputMode="numeric"
        className="nx-phone__number"
        value={value}
        /* Almost every number typed in this CRM belongs to a customer, not to
           the person typing it, so offering to autofill their own would be
           wrong as often as it was right. EmailInput takes the same position
           and for the same reason. */
        autoComplete={autoComplete}
        onChange={handleNumber}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? '0'.repeat(maxLen)}
        maxLength={maxLen}
        disabled={disabled}
        required={required}
        aria-label="Phone number"
      />

      {/* So an uncontrolled form still submits both halves. */}
      <input type="hidden" name={name} value={value} />
      {countryName && <input type="hidden" name={countryName} value={dial} />}
    </div>
  );
}
