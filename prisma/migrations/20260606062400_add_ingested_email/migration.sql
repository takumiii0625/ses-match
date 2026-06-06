-- CreateEnum
CREATE TYPE "IngestKind" AS ENUM ('TALENT', 'PROJECT', 'IGNORE', 'ERROR');

-- CreateTable
CREATE TABLE "IngestedEmail" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "gmailId" TEXT,
    "fromAddr" TEXT,
    "subject" TEXT,
    "receivedAt" TIMESTAMP(3),
    "kind" "IngestKind" NOT NULL DEFAULT 'IGNORE',
    "talentId" TEXT,
    "projectId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestedEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IngestedEmail_messageId_key" ON "IngestedEmail"("messageId");

-- CreateIndex
CREATE INDEX "IngestedEmail_orgId_createdAt_idx" ON "IngestedEmail"("orgId", "createdAt");
