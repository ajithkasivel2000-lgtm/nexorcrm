/**
 * Email templates the application looks up by key.
 *
 * Each of these is fetched by `templateKey` at the moment something happens —
 * a lead is created, a site visit is booked, a lead becomes an opportunity.
 * There is no foreign key involved, so deleting one deletes nothing visible
 * and breaks nothing loudly: the send is simply skipped from then on.
 *
 * They are therefore not "Custom" templates, whatever the `type` column says,
 * and the API refuses to delete them. Switching one off is still allowed —
 * that is a deliberate choice a person can make and undo.
 *
 * Keep this in step with frontend/src/utils/emailTemplates.js.
 */
const SYSTEM_TEMPLATE_KEYS = [
  'CREATE_NEW_LEAD_TEMPLATE',
  'SITE_VISIT_SCHEDULED_TEMPLATE',
  'LEAD_CONVERTED_TO_OPPORTUNITY_TEMPLATE',
  // Optional: when absent, a lead changing hands still emails the new owner
  // using built-in wording. Listed so one written by hand is protected.
  'LEAD_REASSIGNED_TEMPLATE',
];

/** True when the application sends with this template by key. */
function isSystemTemplate(templateKey) {
  return SYSTEM_TEMPLATE_KEYS.includes(String(templateKey || '').trim().toUpperCase());
}

module.exports = { SYSTEM_TEMPLATE_KEYS, isSystemTemplate };
