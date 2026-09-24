/**
 * The limits a date field should carry, and the one place that decides them.
 *
 * A datetime-local input accepts `min` and `max` as "YYYY-MM-DDTHH:mm" in LOCAL
 * time. Handing it an ISO string is the usual mistake: toISOString() is UTC, so
 * in IST it sets the floor five and a half hours in the past and the guard
 * silently does nothing.
 *
 * These are a convenience, not a rule. The browser will not stop a determined
 * caller, so anything that actually matters is checked again on the server —
 * see the note on each helper below.
 */

/** "now", formatted the way a datetime-local input expects it. */
export function nowForInput() {
  const now = new Date();
  // Shift by the offset so slicing the ISO string yields local time, not UTC.
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

/** Today, for a plain `date` input. */
export function todayForInput() {
  return nowForInput().slice(0, 10);
}

/**
 * Which way a field is allowed to point.
 *
 * Not every date is a future date, and getting this wrong is worse than not
 * setting it at all: "Done Date" records a visit that has already happened, so
 * a future-only floor there would block the honest answer and push somebody
 * into entering a wrong one.
 *
 *   'future'  scheduling something — today onwards
 *   'past'    recording something that already happened — today backwards
 *   null      genuinely either way, so no limit
 */
export function boundsFor(direction) {
  if (direction === 'future') return { min: nowForInput() };
  if (direction === 'past') return { max: nowForInput() };
  return {};
}
