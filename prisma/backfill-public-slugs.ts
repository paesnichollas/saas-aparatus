import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";
import { buildPublicSlugCandidate, getPublicSlugBase } from "../lib/public-slug";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const resolveNextAvailableSlug = (baseSlug: string, takenSlugs: Set<string>) => {
  let suffix = 1;

  for (;;) {
    const candidateSlug = buildPublicSlugCandidate(baseSlug, suffix);

    if (!takenSlugs.has(candidateSlug)) {
      return candidateSlug;
    }

    suffix += 1;
  }
};

const run = async () => {
  const [barbershopsWithoutPublicSlug, existingPublicSlugs] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT "id", "name"
      FROM "Barbershop"
      WHERE "publicSlug" IS NULL OR btrim("publicSlug") = ''
      ORDER BY "name" ASC, "id" ASC
    `,
    prisma.$queryRaw<Array<{ publicSlug: string }>>`
      SELECT "publicSlug"
      FROM "Barbershop"
      WHERE "publicSlug" IS NOT NULL AND btrim("publicSlug") <> ''
    `,
  ]);

  const takenSlugs = new Set(existingPublicSlugs.map((barbershop) => barbershop.publicSlug));

  for (const barbershop of barbershopsWithoutPublicSlug) {
    const baseSlug = getPublicSlugBase(barbershop.name);
    const publicSlug = resolveNextAvailableSlug(baseSlug, takenSlugs);

    await prisma.$executeRaw`
      UPDATE "Barbershop"
      SET "publicSlug" = ${publicSlug}
      WHERE "id" = ${barbershop.id}
      AND ("publicSlug" IS NULL OR btrim("publicSlug") = '')
    `;

    takenSlugs.add(publicSlug);
    console.log(`Backfilled publicSlug for ${barbershop.id}: ${publicSlug}`);
  }

  console.log(`Backfill completed. Updated ${barbershopsWithoutPublicSlug.length} barbershops.`);
};

run()
  .catch((error) => {
    console.error("Failed to backfill barbershop publicSlug.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
