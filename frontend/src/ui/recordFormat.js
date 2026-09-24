/**
 * Formatting helpers for the record pages.
 *
 * Separate from RecordPage.jsx because fast refresh only works on a module
 * that exports components alone.
 */

/** Initials for a hero avatar. */
export function initialsOf(name) {
  return (name || '?')
    .split(' ').filter(Boolean).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join('') || '?';
}

/** "12 Mar 2026, 04:30 PM" — the format used across the data tables. */
export function recordStamp(value) {
  if (!value) return '—';
  const raw = String(value);
  if (raw.startsWith('on ')) return raw.slice(3);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).replace(',', '');
}

/** A datetime-local input wants "YYYY-MM-DDTHH:mm" in local time. */
export function toDateTimeLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

/**
 * A date input wants "YYYY-MM-DD" in local time.
 *
 * Passing it a stored ISO timestamp leaves the input blank — it rejects
 * anything that is not exactly that shape — so a saved date looked unset.
 * Sliced from local time rather than from toISOString(), which would shift the
 * day backwards for anywhere east of UTC in the early hours.
 */
export function toDateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}
