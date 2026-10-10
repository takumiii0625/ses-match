-- 判定済みペア台帳（成立/不成立問わずLLM判定したペアを記録→再判定スキップ用）
CREATE TABLE "MatchJudgment" (
    "talentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "judgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchJudgment_pkey" PRIMARY KEY ("talentId","projectId")
);
CREATE INDEX "MatchJudgment_projectId_idx" ON "MatchJudgment"("projectId");
CREATE INDEX "MatchJudgment_orgId_idx" ON "MatchJudgment"("orgId");

-- 既存の成立マッチを台帳へバックフィル（デプロイ直後に既存ペアを再判定しないため）。
INSERT INTO "MatchJudgment" ("talentId","projectId","orgId","judgedAt")
SELECT m."talentId", m."projectId", p."orgId", m."createdAt"
FROM "Match" m
JOIN "Project" p ON p."id" = m."projectId"
ON CONFLICT ("talentId","projectId") DO NOTHING;
