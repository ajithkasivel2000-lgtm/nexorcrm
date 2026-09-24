/**
 * Maps CRM status text onto a Pill tone, so status colouring stays consistent
 * across every screen instead of being re-decided per table.
 */
export function toneForStatus(status) {
  const s = String(status || '').toLowerCase();
  // A repeat needs a look before anyone calls, so it reads as a caution
  // rather than as a normal state. Checked first: 'Possible Duplicate'
  // would otherwise be caught by nothing and fall through to neutral.
  if (s.includes('duplicat')) return 'warning';
  if (s.includes('reject') || s.includes('invalid') || s.includes('lost') || s.includes('dead')) return 'danger';
  if (s.includes('won') || s.includes('book') || s.includes('convert') || s.includes('done') || s.includes('active')) return 'success';
  if (s.includes('follow') || s.includes('pending') || s.includes('progress') || s.includes('warm')) return 'warning';
  /* Someone is working this lead right now. Distinct from 'new' (nobody has
     touched it) and from 'success' (the work is finished), because at a glance
     those are the three things worth telling apart. */
  if (s.includes('interest')) return 'accent';
  if (s.includes('attempt') || s.includes('contact') || s.includes('allocat')) return 'info';
  // "Registered" is a just-created, not-yet-activated state — same family as "New".
  if (s.includes('new') || s.includes('open') || s.includes('registered')) return 'info';
  // Confirmed sits between scheduled and done, so it gets its own colour:
  // the three visit stages are the ones read side by side in a list.
  if (s.includes('confirm')) return 'accent';
  if (s.includes('visit') || s.includes('opportunit')) return 'purple';
  return 'neutral';
}
