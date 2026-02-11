-- AlterTable
ALTER TABLE "Barbershop" ADD COLUMN "publicSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Barbershop_publicSlug_key" ON "Barbershop"("publicSlug");
