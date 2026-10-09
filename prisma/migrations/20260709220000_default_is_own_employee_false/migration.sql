-- 自社社員フラグの既定を OFF(false) に変更し、既存の自社保有人材もすべて OFF に揃える。
-- （社員のときだけ手動で ON にする運用）
ALTER TABLE "Talent" ALTER COLUMN "isOwnEmployee" SET DEFAULT false;
UPDATE "Talent" SET "isOwnEmployee" = false;
