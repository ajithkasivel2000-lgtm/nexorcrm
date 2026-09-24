/**
 * Country-aware phone validation.
 *
 * The old validateIndianMobile hardcoded "10 digits starting 6-9", which would
 * reject a perfectly valid US or Singapore number now that the UI offers a
 * country selector. Rules live in one table shared by every controller.
 *
 * Keep this in step with frontend/src/ui/countries.js.
 */
const RULES = {
  '+91': { name: 'India', len: [10], start: /^[6-9]/ },
  '+1': { name: 'United States/Canada', len: [10] },
  '+44': { name: 'United Kingdom', len: [10, 11] },
  '+971': { name: 'United Arab Emirates', len: [9] },
  '+966': { name: 'Saudi Arabia', len: [9] },
  '+65': { name: 'Singapore', len: [8] },
  '+61': { name: 'Australia', len: [9] },
  '+49': { name: 'Germany', len: [10, 11] },
  '+33': { name: 'France', len: [9] },
  '+81': { name: 'Japan', len: [10] },
  '+86': { name: 'China', len: [11] },
  '+60': { name: 'Malaysia', len: [9, 10] },
  '+94': { name: 'Sri Lanka', len: [9] },
  '+977': { name: 'Nepal', len: [10] },
  '+880': { name: 'Bangladesh', len: [10] },
  '+92': { name: 'Pakistan', len: [10] },
  '+974': { name: 'Qatar', len: [8] },
  '+965': { name: 'Kuwait', len: [8] },
  '+968': { name: 'Oman', len: [8] },
  '+973': { name: 'Bahrain', len: [8] },
  '+27': { name: 'South Africa', len: [9] },
  '+64': { name: 'New Zealand', len: [8, 9] },
  '+39': { name: 'Italy', len: [9, 10] },
  '+34': { name: 'Spain', len: [9] },
  '+31': { name: 'Netherlands', len: [9] },
  '+41': { name: 'Switzerland', len: [9] },
  '+66': { name: 'Thailand', len: [9] },
  '+62': { name: 'Indonesia', len: [9, 10, 11] },
  '+63': { name: 'Philippines', len: [10] },
};

const DEFAULT_DIAL = '+91';

function normalizeDial(dial) {
  const d = String(dial || DEFAULT_DIAL).trim();
  const withPlus = d.startsWith('+') ? d : `+${d}`;
  return RULES[withPlus] ? withPlus : DEFAULT_DIAL;
}

/**
 * Validates and normalises a phone number for a country.
 *
 * Returns the cleaned national number, or throws with a readable message.
 * Pass allowEmpty for optional fields.
 */
function validatePhone(value, dial = DEFAULT_DIAL, allowEmpty = false) {
  const code = normalizeDial(dial);
  const rule = RULES[code];

  if (value === null || value === undefined || String(value).trim() === '') {
    if (allowEmpty) return '';
    throw new Error('Mobile number is required.');
  }

  // Tolerate a number that already carries its country code, which some
  // existing rows and the public lead forms do.
  let digits = String(value).replace(/\D/g, '');
  const bare = code.slice(1);
  if (digits.startsWith(bare) && digits.length > bare.length) {
    const withoutCode = digits.slice(bare.length);
    if (rule.len.includes(withoutCode.length)) digits = withoutCode;
  }

  if (!rule.len.includes(digits.length)) {
    throw new Error(`${rule.name} numbers must be ${rule.len.join(' or ')} digits.`);
  }
  if (rule.start && !rule.start.test(digits)) {
    throw new Error(`${rule.name} mobile numbers must start with 6, 7, 8 or 9.`);
  }
  return digits;
}

/** Formats for display, e.g. "+91 98765 43210". */
function formatPhone(number, dial = DEFAULT_DIAL) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return '-';
  const code = normalizeDial(dial);
  if (code === '+91' && digits.length === 10) {
    return `${code} ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return `${code} ${digits}`;
}

module.exports = { validatePhone, formatPhone, normalizeDial, RULES, DEFAULT_DIAL };
