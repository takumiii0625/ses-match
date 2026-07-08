import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { Card } from "@/components/ui/card";
import { InhouseMatchesList } from "./inhouse-list";
import { toMatchVM, matchVmSelect, buildSentInfoMap, buildSentTalentMap } from "../serialize";
import { RematchButton } from "../../matching/rematch-button";

export const metadata = { title: "人材マッチ（他社・自社） — Caduceus" };
export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

export default async function InhouseMatchesPage() {
  const org = await getCurrentOrg();

  // 人材起点のマッチ。自社保有人材は常に表示、他社人材は直近3日にマッチした分のみ表示。
  const recent = new Date(Date.now() - 3 * DAY);
  const [matches, sentMap, sentTalentMap] = await Promise.all([
    prisma.match.findMany({
      where: {
        project: { orgId: org.id },
        talent: { orgId: org.id },
        score: { gte: 70 },
        rejectedAt: null,
        OR: [
          { talent: { talentType: "INHOUSE" } },
          { createdAt: { gte: recent } },
        ],
      },
      select: matchVmSelect,
      orderBy: [{ createdAt: "desc" }, { score: "desc" }],
    }),
    buildSentInfoMap(org.id),
    buildSentTalentMap(org.id),
  ]);

  const vm = matches.map((m) => {
    const key = `${m.talent.id}#${m.project.id}`;
    return toMatchVM(m, sentMap.get(key) ?? null, sentTalentMap.get(key) ?? null);
  });

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">人材マッチ（他社・自社）</h1>
          <p className="mt-1 text-sm text-muted">
            人材ごとにマッチした案件を点数順で表示（70点以上）。自社保有人材は常に表示、他社人材は直近3日にマッチした分。
            所属はその場で編集できます（商流判定に反映）。
          </p>
        </div>
        <Link
          href="/matching"
          className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
        >
          マッチングを実行 →
        </Link>
      </div>

      <Card className="p-5">
        <p className="mb-2 text-xs text-muted">
          自社＋他社の人材を候補に、手動でマッチを計算して保存します（既定は直近3日）。定期マッチとは別の手動実行です。
        </p>
        <RematchButton scope="all" label="他社・自社マッチを実行" />
      </Card>

      <InhouseMatchesList matches={vm} />
    </div>
  );
}
