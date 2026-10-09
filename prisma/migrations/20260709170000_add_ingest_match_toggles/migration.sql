-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "ingestEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "matchEnabled" BOOLEAN NOT NULL DEFAULT true;
