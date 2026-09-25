-- Session ids used to be readable counters (SES-2026-001, -002, ...), and a
-- session's id is its bearer token, so anyone could sign in as anyone by
-- guessing the next number. New sessions get 256 random bits (prismaClient.js);
-- every old, guessable session is ended here. Everyone signs in once more.
DELETE FROM "Session" WHERE "id" LIKE 'SES-%';
