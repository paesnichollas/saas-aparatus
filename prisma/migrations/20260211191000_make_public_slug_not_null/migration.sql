-- Prefer running prisma/backfill-public-slugs.ts before this migration.
-- Fallbacks to existing internal slug when publicSlug is still empty.
UPDATE "Barbershop"
SET "publicSlug" = "slug"
WHERE "publicSlug" IS NULL OR btrim("publicSlug") = '';

ALTER TABLE "Barbershop"
ALTER COLUMN "publicSlug" SET NOT NULL;
