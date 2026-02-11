UPDATE "user"
SET "currentBarbershopId" = "barbershopId"
WHERE "role" = 'OWNER'
  AND "barbershopId" IS NOT NULL
  AND (
    "currentBarbershopId" IS NULL
    OR "currentBarbershopId" <> "barbershopId"
  );
