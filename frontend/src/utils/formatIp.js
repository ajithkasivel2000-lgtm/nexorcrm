/**
 * An IP address as people expect to read it. Node reports IPv4 clients as
 * IPv6-mapped addresses (::ffff:10.0.0.5) and this machine as ::1.
 */
export default function formatIp(ip) {
  if (!ip) return '—';
  const s = String(ip).trim();
  if (s === '::1') return '127.0.0.1';
  if (s.startsWith('::ffff:')) return s.substring(7);
  if (s === '::') return '0.0.0.0';
  return s;
}
