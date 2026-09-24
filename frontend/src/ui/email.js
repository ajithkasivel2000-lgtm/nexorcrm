/**
 * Email validation, matching backend/utils/email.js exactly.
 *
 * The browser's own `type="email"` check is far looser than it looks — it
 * accepts `a@b` and `x@localhost` — so every screen that collects an address
 * uses this instead, and the server re-checks with the same rule.
 */

/** local@domain.tld — see backend/utils/email.js for the reasoning. */
export const EMAIL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

export const EMAIL_MAX_LENGTH = 254;

/**
 * Trims and lowercases an address. Domains are case-insensitive and no real
 * provider treats the local part as case-sensitive, so storing one canonical
 * form is what stops "Ajith@x.com" and "ajith@x.com" becoming two contacts.
 */
export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Returns an error message for an address, or '' when it is acceptable.
 *
 * @param {string} value
 * @param {object} [options]
 * @param {boolean} [options.required=false]
 * @param {string}  [options.label='Email']
 */
export function emailError(value, { required = false, label = 'Email' } = {}) {
  const cleaned = normalizeEmail(value);
  if (cleaned === '') return required ? `${label} is required.` : '';
  if (cleaned.length > EMAIL_MAX_LENGTH) return `${label} is too long.`;
  if (cleaned.includes('..')) return `${label} is not a valid email address.`;
  if (!EMAIL_RE.test(cleaned)) return `${label} is not a valid email address.`;
  return '';
}

/** Convenience boolean for call sites that only need to branch. */
export function isValidEmail(value, options) {
  return emailError(value, options) === '';
}
