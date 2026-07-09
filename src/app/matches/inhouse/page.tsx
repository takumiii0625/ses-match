import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { Card } from "@/components/ui/card";
import { InhouseMatchesList } from "./inhouse-list";
import { toMatchVM, matchVmSelect, buildSentInfoMap, buildSentTalentMap } from "../serialize";
import { RematchButton } from "../../matching/rematch-button";

export const metadata = { title: "自社保有人材マッチ（手動） — Caduceus" };
export const dynamic = "force-dynamic";

export default async function InhouseMatchesPage() {
  const org = await getCurrentOrg();

  // 自社保有人材(INHOUSE)が絡むマッチだけ・70点以上。
  const [matches, sentMap, sentTalentMap] = await Promise.all([
    prisma.match.findMany({
      where: {
        project: { orgId: org.id },
        talent: { orgId: org.id, talentType: "INHOUSE" },
        score: { gte: 70 },
        rejectedAt: null,
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
          <h1 className="text-xl font-semibold text-foreground">自社保有人材マッチ（手動）</h1>
          <p className="mt-1 text-sm text-muted">
            自社保有人材ごとにマッチした案件を点数順で表示（70点以上）。所属はその場で編集できます（商流判定に反映）。
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
          自社保有人材だけを候補に、直近3日の案件と手動でマッチを計算して保存します（既定は過去3日。他社人材のマッチは保持されます）。
        </p>
        <RematchButton scope="inhouse" defaultDays="3" label="自社保有人材マッチを実行" />
      </Card>

      <InhouseMatchesList matches={vm} />
    </div>
  );
}
