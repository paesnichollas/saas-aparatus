-- AlterTable
ALTER TABLE "Barbershop"
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "user"
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
