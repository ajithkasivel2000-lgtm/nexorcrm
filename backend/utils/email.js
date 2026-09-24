/**
 * Email validation and normalisation.
 *
 * Nothing checked email addresses before this: every controller stored
 * whatever string arrived, so "asdf", "a@b" and a trailing-space copy-paste all
 * became rows. That matters more than it looks — the CRM sends mail to these
 * addresses, and a duplicate that differs only by case or whitespace reads as
 * two different people.
 *
 * Deliberately not RFC 5322. The full grammar accepts addresses no mail
 * provider will issue and is famously unreadable; this is the practical subset
 * every real address falls into, which is what a CRM wants.
 *
 * Keep this in step with frontend/src/ui/email.js.
 */

/**
 * local@domain.tld
 *   local  — no spaces, no @, no leading/trailing dot, no consecutive dots
 *   domain — letters/digits/hyphens in each label, at least two labels
 *   tld    — at least two letters
 */
const EMAIL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/** Longest address the spec allows; also what most databases assume. */
const MAX_LENGTH = 254;

/**
 * Validates an email address and returns it normalised.
 *
 * Normalising means trimming surrounding whitespace and lowercasing — domains
 * are case-insensitive, and no mail provider in practice treats the local part
 * as case-sensitive either. Storing one canonical form is what makes duplicate
 * detection work.
 *
 * @param {string}  value            the address as it arrived
 * @param {object}  [options]
 * @param {boolean} [options.allowEmpty=false]  empty/null returns '' instead of throwing
 * @param {string}  [options.label='Email']     name used in the error message
 * @returns {string} the normalised address, or '' when empty and allowed
 * @throws {Error} with a message safe to show the user
 */
function validateEmail(value, { allowEmpty = false, label = 'Email' } = {}) {
  if (value === null || value === undefined || String(value).trim() === '') {
    if (allowEmpty) return '';
    throw new Error(`${label} is required.`);
  }

  const cleaned = String(value).trim().toLowerCase();

  if (cleaned.length > MAX_LENGTH) {
    throw new Error(`${label} is too long (max ${MAX_LENGTH} characters).`);
  }
  if (cleaned.includes('..')) {
    throw new Error(`${label} is not a valid email address.`);
  }
  if (!EMAIL_RE.test(cleaned)) {
    throw new Error(`${label} is not a valid email address.`);
  }

  return cleaned;
}

/**
 * Same check, but returns a boolean instead of throwing — for call sites that
 * only need to branch.
 */
function isValidEmail(value, options) {
  try {
    validateEmail(value, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Applies validateEmail to the named fields on `data`, rewriting each in place
 * with its normalised form.
 *
 * When `required` is false (a partial update), a key that is absent is left
 * alone — an update that never mentions an email column should not touch it.
 * When `required` is true (a create, on a NOT NULL column), an absent key is
 * itself the error; otherwise the missing value reaches Prisma and surfaces as
 * a 500 instead of a readable 400.
 *
 * @param {object} data    the incoming request body (mutated)
 * @param {Array<[string, string]>} fields  [column, label] pairs to check
 * @param {boolean} [required=false] whether the address must be present
 * @returns {string|null} an error message for the caller to send as a 400,
 *                        or null when everything validated
 */
function coerceEmails(data, fields, required = false) {
  for (const [key, label] of fields) {
    if (!required && !(key in data)) continue;
    try {
      const normalized = validateEmail(data[key], { allowEmpty: !required, label });
      // An optional field that came in empty stays empty rather than becoming
      // the string '' on a nullable column.
      data[key] = normalized === '' ? null : normalized;
    } catch (err) {
      return err.message;
    }
  }
  return null;
}

module.exports = { validateEmail, isValidEmail, coerceEmails, EMAIL_RE, MAX_LENGTH };
