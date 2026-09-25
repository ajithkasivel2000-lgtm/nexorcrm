-- The legacy "Leads" table was the original lead store before the multi-company
-- "Lead" model. Every read and write moved to "Lead" long ago and the table has
-- been empty in every environment (verified 2026-09-25); the /api/enquiries
-- routes that were its last consumers were removed with this migration.
DROP TABLE IF EXISTS "Leads";
