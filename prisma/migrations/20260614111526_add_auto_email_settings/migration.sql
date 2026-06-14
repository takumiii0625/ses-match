-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "autoEmailDailyCap" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "autoEmailEnabled" BOOLEAN NOT NULL DEFAULT false;
