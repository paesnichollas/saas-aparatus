-- Add provider and explicit phone verification status to user profiles.
ALTER TABLE "user"
ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'credentials',
ADD COLUMN "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "phoneVerifiedAt" TIMESTAMPTZ;

-- Normalize legacy phone values to E.164 with BR default country code.
UPDATE "user"
SET "phone" = CASE
  WHEN "phone" IS NULL THEN NULL
  WHEN REGEXP_REPLACE("phone", '\D', '', 'g') = '' THEN NULL
  WHEN LEFT(TRIM("phone"), 1) = '+' THEN CONCAT('+', REGEXP_REPLACE("phone", '\D', '', 'g'))
  WHEN REGEXP_REPLACE("phone", '\D', '', 'g') ~ '^55\d{10,11}$' THEN CONCAT('+', REGEXP_REPLACE("phone", '\D', '', 'g'))
  WHEN REGEXP_REPLACE("phone", '\D', '', 'g') ~ '^\d{10,11}$' THEN CONCAT('+55', REGEXP_REPLACE("phone", '\D', '', 'g'))
  ELSE CONCAT('+', REGEXP_REPLACE("phone", '\D', '', 'g'))
END
WHERE "phone" IS NOT NULL;

-- Backfill provider from existing auth footprint.
UPDATE "user" AS "u"
SET "provider" = CASE
  WHEN LOWER("u"."email") LIKE '%@phone.local' THEN 'phone'
  WHEN EXISTS (
    SELECT 1
    FROM "account" AS "a"
    WHERE "a"."userId" = "u"."id"
      AND LOWER("a"."providerId") = 'google'
  ) THEN 'google'
  ELSE 'credentials'
END;

-- Legacy phone users are considered verified and receive an audit timestamp.
UPDATE "user"
SET
  "phoneVerified" = true,
  "phoneVerifiedAt" = COALESCE("phoneVerifiedAt", NOW())
WHERE "provider" = 'phone'
  AND "phone" IS NOT NULL;
