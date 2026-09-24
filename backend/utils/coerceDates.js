/**
 * Turning date-input strings into DateTime values.
 *
 * A `<input type="date">` sends "2026-09-12" and a cleared one sends "". Prisma
 * wants a Date or null and rejects both of those, so an update carrying a date
 * fails with "Some of the submitted fields are not valid" — which names no
 * field and looks like a validation problem with something else entirely.
 *
 * Mutates `data` in place. Returns a message for the caller to send as a 400,
 * or null when everything parsed.
 */
function coerceDates(data, fields) {
  for (const key of fields) {
    if (!(key in data)) continue;

    const value = data[key];
    // A cleared date input means "no date", which is null rather than ''.
    if (value === '' || value === null || value === undefined) {
      data[key] = null;
      continue;
    }
    if (value instanceof Date) continue;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return `${key} is not a valid date`;
    data[key] = parsed;
  }
  return null;
}

module.exports = { coerceDates };
