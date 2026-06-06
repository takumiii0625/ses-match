-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "emailFrom" TEXT,
ADD COLUMN     "emailSubject" TEXT,
ADD COLUMN     "emailTo" TEXT;

-- AlterTable
ALTER TABLE "Talent" ADD COLUMN     "emailFrom" TEXT,
ADD COLUMN     "emailTo" TEXT;
