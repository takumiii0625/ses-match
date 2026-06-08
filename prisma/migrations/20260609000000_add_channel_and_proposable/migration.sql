-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "channelText" TEXT,
ADD COLUMN     "supportFee" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "proposable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "channelNote" TEXT;
