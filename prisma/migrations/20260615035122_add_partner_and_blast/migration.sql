-- CreateEnum
CREATE TYPE "PartnerContactStatus" AS ENUM ('ACTIVE', 'BOUNCED', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "BlastStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENDING', 'DONE', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "BlastRecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "blastDailyCap" INTEGER NOT NULL DEFAULT 1000;

-- CreateTable
CREATE TABLE "PartnerCompany" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "industry" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "note" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerContact" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT,
    "status" "PartnerContactStatus" NOT NULL DEFAULT 'ACTIVE',
    "unsubscribeToken" TEXT NOT NULL,
    "bounceCount" INTEGER NOT NULL DEFAULT 0,
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlastCampaign" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "talentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "BlastStatus" NOT NULL DEFAULT 'DRAFT',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BlastCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlastRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "toAddr" TEXT NOT NULL,
    "status" "BlastRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "BlastRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerCompany_orgId_idx" ON "PartnerCompany"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerCompany_orgId_name_key" ON "PartnerCompany"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerContact_unsubscribeToken_key" ON "PartnerContact"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "PartnerContact_orgId_status_idx" ON "PartnerContact"("orgId", "status");

-- CreateIndex
CREATE INDEX "PartnerContact_companyId_idx" ON "PartnerContact"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerContact_orgId_email_key" ON "PartnerContact"("orgId", "email");

-- CreateIndex
CREATE INDEX "BlastCampaign_orgId_createdAt_idx" ON "BlastCampaign"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "BlastCampaign_orgId_status_idx" ON "BlastCampaign"("orgId", "status");

-- CreateIndex
CREATE INDEX "BlastRecipient_campaignId_status_idx" ON "BlastRecipient"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BlastRecipient_campaignId_contactId_key" ON "BlastRecipient"("campaignId", "contactId");

-- AddForeignKey
ALTER TABLE "PartnerCompany" ADD CONSTRAINT "PartnerCompany_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerContact" ADD CONSTRAINT "PartnerContact_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerContact" ADD CONSTRAINT "PartnerContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "PartnerCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlastCampaign" ADD CONSTRAINT "BlastCampaign_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlastRecipient" ADD CONSTRAINT "BlastRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "BlastCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
