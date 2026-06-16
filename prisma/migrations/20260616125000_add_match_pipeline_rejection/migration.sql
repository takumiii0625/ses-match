-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "stAccept" TIMESTAMP(3),
ADD COLUMN     "stClient" TIMESTAMP(3),
ADD COLUMN     "stClosed" TIMESTAMP(3),
ADD COLUMN     "stInterview" TIMESTAMP(3),
ADD COLUMN     "stTalent" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MatchRejection" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "projectTitle" TEXT,
    "talentName" TEXT,
    "score" DOUBLE PRECISION,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchRejection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchRejection_orgId_createdAt_idx" ON "MatchRejection"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "Match_rejectedAt_idx" ON "Match"("rejectedAt");

-- AddForeignKey
ALTER TABLE "MatchRejection" ADD CONSTRAINT "MatchRejection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
