-- The previous migration back-filled "updatedAt" with the database server's local clock. Prisma stores UTC, so on a
-- server not running in UTC those rows looked like they were modified in the future. Normalise them (no-op on UTC servers).
UPDATE "RewardEntitlement" SET "updatedAt" = "createdAt";
UPDATE "PackageBenefit" SET "updatedAt" = LEAST("updatedAt", timezone('UTC', now()));
