-- CreateTable
CREATE TABLE "SentEmail" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "toAddr" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SentEmail_orgId_createdAt_idx" ON "SentEmail"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "SentEmail_talentId_projectId_idx" ON "SentEmail"("talentId", "projectId");
