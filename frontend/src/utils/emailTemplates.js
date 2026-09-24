/**
 * Email templates the application sends by key.
 *
 * These are looked up by `templateKey` when a lead is created, a site visit is
 * booked, or a lead becomes an opportunity. Deleting one stops that email for
 * good without anything failing visibly, so the API refuses to delete them and
 * the list does not offer it.
 *
 * Switching one off is still allowed — that is a real choice, and reversible.
 *
 * Keep this in step with backend/utils/emailTemplates.js.
 */
export const SYSTEM_TEMPLATE_KEYS = [
  'CREATE_NEW_LEAD_TEMPLATE',
  'SITE_VISIT_SCHEDULED_TEMPLATE',
  'LEAD_CONVERTED_TO_OPPORTUNITY_TEMPLATE',
  // Optional: when absent, a lead changing hands still emails the new owner
  // using built-in wording. Listed so one written by hand is protected.
  'LEAD_REASSIGNED_TEMPLATE',
];

/** True when the application sends with this template by key. */
export function isSystemTemplate(templateKey) {
  return SYSTEM_TEMPLATE_KEYS.includes(String(templateKey || '').trim().toUpperCase());
}
