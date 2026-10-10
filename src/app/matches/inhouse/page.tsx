import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { Card } from "@/components/ui/card";
import { MatchesList } from "../matches-list";
import { toMatchVM, matchVmSelect, buildSentInfoMap, buildSentTalentMap } from "../serialize";
import { RematchButton } from "../../matching/rematch-button";
import { DISPLAY_MIN_SCORE } from "@/lib/match-run";

export const metadata = { title: "自社保有人材マッチ（手動） — Caduceus" };
export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

export default async function InhouseMatchesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const daysParam = (Array.isArray(sp.days) ? sp.days[0] : sp.days) ?? "all";
  const days = daysParam === "all" ? 0 : Number(daysParam) || 0;
  const org = await getCurrentOrg();

  const window =
    days > 0 ? { createdAt: { gte: new Date(Date.now() - days * DAY) } } : {};

  // 期間ごとの対象案件数（取込日 createdAt が直近N日のorg案件）。実行前に規模が分かるように表示する。
  const now = Date.now();
  const countFor = (d: number) =>
    prisma.project.count({ where: { orgId: org.id, createdAt: { gte: new Date(now - d * DAY) } } });

  // マッチ対象の自社保有人材（＝候補の固定側。誰が対象か分かるように一覧表示する）。
  const inhouseTalents = prisma.talent.findMany({
    where: { orgId: org.id, talentType: "INHOUSE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, isOwnEmployee: true },
  });

  // 自社保有人材(INHOUSE)が絡むマッチだけ・70点以上。既定は全期間表示。
  const [matches, sentMap, sentTalentMap, c1, c2, c3, c7, talents] = await Promise.all([
    prisma.match.findMany({
      where: {
        project: { orgId: org.id },
        talent: { orgId: org.id, talentType: "INHOUSE" },
        score: { gte: DISPLAY_MIN_SCORE },
        rejectedAt: null,
        ...window,
      },
      select: matchVmSelect,
      orderBy: [{ createdAt: "desc" }, { score: "desc" }],
    }),
    buildSentInfoMap(org.id),
    buildSentTalentMap(org.id),
    countFor(1),
    countFor(2),
    countFor(3),
    countFor(7),
    inhouseTalents,
  ]);
  const projectCounts: Record<string, number> = { "1": c1, "2": c2, "3": c3, "7": c7 };

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
          マッチ設定 →
        </Link>
      </div>

      <Card className="p-5">
        <p className="mb-2 text-xs text-muted">
          自社保有人材だけを候補に、選んだ期間に取り込んだ案件と手動でマッチを計算して保存します（既定は過去3日。他社人材のマッチは保持されます）。
          期間を選ぶと、その期間の対象案件数が表示されます。
        </p>
        <RematchButton
          scope="inhouse"
          defaultDays="3"
          label="自社保有人材マッチを実行"
          projectCounts={projectCounts}
        />

        {/* マッチ対象の自社保有人材（誰が対象か） */}
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs font-medium text-slate-500">
            マッチ対象の自社保有人材（{talents.length}名）
          </p>
          {talents.length === 0 ? (
            <p className="text-xs text-muted">
              自社保有人材が登録されていません。
              <Link href="/in-house-talent" className="ml-1 text-primary underline">
                自社保有人材
              </Link>
              から登録してください。
            </p>
          ) : (
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
              {talents.map((t) => (
                <Link
                  key={t.id}
                  href={`/talent/${t.id}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2.5 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  {t.name}
                  {t.isOwnEmployee && <span className="text-[10px] text-emerald-600">社員</span>}
                </Link>
              ))}
            </div>
          )}
        </div>
      </Card>

      <MatchesList matches={vm} scope="inhouse" defaultGroupMode="talent" days={daysParam} />
    </div>
  );
}
