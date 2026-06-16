-- CreateTable
CREATE TABLE "NgCompany" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NgCompany_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NgCompany_orgId_idx" ON "NgCompany"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "NgCompany_orgId_domain_key" ON "NgCompany"("orgId", "domain");

-- AddForeignKey
ALTER TABLE "NgCompany" ADD CONSTRAINT "NgCompany_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
