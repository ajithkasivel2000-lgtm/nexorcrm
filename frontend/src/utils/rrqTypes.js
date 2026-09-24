/**
 * RRQ types the lead-routing code depends on by name.
 *
 * Incoming website, campaign and imported leads are assigned by looking up a
 * queue whose `rrqType` is 'Presales' or 'Sales'. Those are string matches, so
 * deleting the type breaks assignment without any error appearing — leads just
 * stop being allocated.
 *
 * The API refuses to delete these too; this is only so the button isn't
 * offered in the first place.
 *
 * Keep this in step with backend/utils/rrqTypes.js.
 */
export const RESERVED_RRQ_TYPES = ['Presales', 'Sales'];

/** True when a type name is one the routing code relies on. Case-insensitive. */
export function isReservedRrqType(name) {
  const value = String(name || '').trim().toLowerCase();
  return RESERVED_RRQ_TYPES.some((reserved) => reserved.toLowerCase() === value);
}
