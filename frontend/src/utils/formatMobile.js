/**
 * Formats a 10-digit Indian mobile number for display as "+91 XXXXX XXXXX".
 * Anything that isn't 10 digits is returned as-is.
 *
 * Six screens called `formatMobile(...)` without it existing anywhere in the
 * codebase, which threw a ReferenceError the moment a row rendered. This is
 * that missing function, matching the backend's formatMobileDisplay.
 */
export default function formatMobile(mobile) {
  if (!mobile) return '—';
  const s = String(mobile);
  if (s.length !== 10) return s;
  return `+91 ${s.slice(0, 5)} ${s.slice(5)}`;
}
