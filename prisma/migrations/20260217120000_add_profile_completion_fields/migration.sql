-- Add explicit profile completion support and a real contact email field.
ALTER TABLE "user"
ADD COLUMN "contactEmail" TEXT,
ADD COLUMN "profileCompleted" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "user_contactEmail_key" ON "user"("contactEmail");

-- Existing users are considered complete to avoid forced interruption.
UPDATE "user"
SET "profileCompleted" = true;
