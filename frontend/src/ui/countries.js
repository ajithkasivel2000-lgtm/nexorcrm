/**
 * Dial codes for the phone input.
 *
 * `iso` drives the flag image (flagcdn, which the app already used for the
 * hardcoded India flag — Windows browsers don't render emoji flags, they fall
 * back to the two letters, so images rather than emoji).
 *
 * `len` is the national number length used for validation. `start` restricts
 * the leading digit where a country has that rule — India's mobile numbers all
 * begin 6-9, which is the check this app already enforced.
 */
export const COUNTRIES = [
  { iso: 'in', dial: '+91', name: 'India', len: [10], start: /^[6-9]/ },
  { iso: 'us', dial: '+1', name: 'United States', len: [10] },
  { iso: 'ca', dial: '+1', name: 'Canada', len: [10] },
  { iso: 'gb', dial: '+44', name: 'United Kingdom', len: [10, 11] },
  { iso: 'ae', dial: '+971', name: 'United Arab Emirates', len: [9] },
  { iso: 'sa', dial: '+966', name: 'Saudi Arabia', len: [9] },
  { iso: 'sg', dial: '+65', name: 'Singapore', len: [8] },
  { iso: 'au', dial: '+61', name: 'Australia', len: [9] },
  { iso: 'de', dial: '+49', name: 'Germany', len: [10, 11] },
  { iso: 'fr', dial: '+33', name: 'France', len: [9] },
  { iso: 'jp', dial: '+81', name: 'Japan', len: [10] },
  { iso: 'cn', dial: '+86', name: 'China', len: [11] },
  { iso: 'my', dial: '+60', name: 'Malaysia', len: [9, 10] },
  { iso: 'lk', dial: '+94', name: 'Sri Lanka', len: [9] },
  { iso: 'np', dial: '+977', name: 'Nepal', len: [10] },
  { iso: 'bd', dial: '+880', name: 'Bangladesh', len: [10] },
  { iso: 'pk', dial: '+92', name: 'Pakistan', len: [10] },
  { iso: 'qa', dial: '+974', name: 'Qatar', len: [8] },
  { iso: 'kw', dial: '+965', name: 'Kuwait', len: [8] },
  { iso: 'om', dial: '+968', name: 'Oman', len: [8] },
  { iso: 'bh', dial: '+973', name: 'Bahrain', len: [8] },
  { iso: 'za', dial: '+27', name: 'South Africa', len: [9] },
  { iso: 'nz', dial: '+64', name: 'New Zealand', len: [8, 9] },
  { iso: 'it', dial: '+39', name: 'Italy', len: [9, 10] },
  { iso: 'es', dial: '+34', name: 'Spain', len: [9] },
  { iso: 'nl', dial: '+31', name: 'Netherlands', len: [9] },
  { iso: 'ch', dial: '+41', name: 'Switzerland', len: [9] },
  { iso: 'th', dial: '+66', name: 'Thailand', len: [9] },
  { iso: 'id', dial: '+62', name: 'Indonesia', len: [9, 10, 11] },
  { iso: 'ph', dial: '+63', name: 'Philippines', len: [10] },
];

export const DEFAULT_DIAL = '+91';

export const flagUrl = (iso) => `https://flagcdn.com/w20/${iso}.png`;

/** First country for a dial code — +1 maps to US ahead of Canada. */
export function countryFor(dial) {
  return COUNTRIES.find((c) => c.dial === dial) || COUNTRIES[0];
}

/** Digits only, with any leading dial code stripped off.
 *
 *  Some existing rows store the code inside the number itself
 *  ("+91 9380068757"), so a plain digit-strip would leave "919380068757". */
export function normalizeNumber(raw, dial = DEFAULT_DIAL) {
  let v = String(raw ?? '').trim();
  if (!v) return '';
  const bare = dial.replace('+', '');
  if (v.startsWith('+')) v = v.slice(1);
  v = v.replace(/\D/g, '');
  if (bare && v.startsWith(bare) && v.length > bare.length) v = v.slice(bare.length);
  return v;
}

/**
 * @returns {string} an error message, or '' when the number is acceptable.
 */
export function validateNumber(number, dial = DEFAULT_DIAL, { required = true } = {}) {
  const country = countryFor(dial);
  const digits = String(number ?? '').replace(/\D/g, '');
  if (!digits) return required ? 'Mobile number is required.' : '';
  if (!country.len.includes(digits.length)) {
    const expected = country.len.join(' or ');
    return `${country.name} numbers are ${expected} digits.`;
  }
  if (country.start && !country.start.test(digits)) {
    return `${country.name} mobile numbers start with 6, 7, 8 or 9.`;
  }
  return '';
}

/** The longest national number this country accepts, for maxLength. */
export const maxLenFor = (dial) => Math.max(...countryFor(dial).len);
