-- New permission pages: "bookings" (Bookings & Payments) and
-- "settings-integrations". A user who already has permission rows is governed
-- by them, and a page with no row is closed — so without this, everyone set up
-- before these pages existed (admins included) would be locked out of them.
-- Each such user gets their role's default for the new pages, the same
-- defaults utils/roleDefaults.js applies to new users. Users with no rows at
-- all are unrestricted already and are left alone.

INSERT INTO "UserPermission" ("id", "companyId", "userId", "page", "view", "create", "edit", "delete", "export", "grantedBy", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u."companyId", u."id", 'bookings',
       TRUE,
       u."status" IN ('Admin', 'superadmin', 'Manager'),
       u."status" IN ('Admin', 'superadmin', 'Manager'),
       u."status" IN ('Admin', 'superadmin'),
       u."status" IN ('Admin', 'superadmin', 'Manager'),
       'migration', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
WHERE u."status" IN ('Admin', 'superadmin', 'Manager', 'Employee', 'Registered')
  AND EXISTS (SELECT 1 FROM "UserPermission" p WHERE p."userId" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "UserPermission" p WHERE p."userId" = u."id" AND p."page" = 'bookings');

INSERT INTO "UserPermission" ("id", "companyId", "userId", "page", "view", "create", "edit", "delete", "export", "grantedBy", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u."companyId", u."id", 'settings-integrations',
       TRUE, FALSE, TRUE, FALSE, FALSE,
       'migration', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
WHERE u."status" IN ('Admin', 'superadmin')
  AND EXISTS (SELECT 1 FROM "UserPermission" p WHERE p."userId" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "UserPermission" p WHERE p."userId" = u."id" AND p."page" = 'settings-integrations');
