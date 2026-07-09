import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { Card } from "@/components/ui/card";
import { MatchesList } from "../matches-list";
import { toMatchVM, matchVmSelect, buildSentInfoMap } from "../serialize";
import { RematchButton } from "../../matching/rematch-button";

export const metadata = { title: "自社保有案件マッチ（手動） — Caduceus" };
export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

export default async function RegisteredMatchesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const daysParam = (Array.isArray(sp.days) ? sp.days[0] : sp.days) ?? "all";
  const days = daysParam === "all" ? 0 : Number(daysParam) || 0;
  const org = await getCurrentOrg();

  const window =
    days > 0 ? { createdAt: { gte: new Date(Date.now() - days * DAY) } } : {};

  // 自社登録案件(dataFrom=REGISTER)のマッチだけ・70点以上・提案可・差し戻し以外。
  const [matches, sentMap] = await Promise.all([
    prisma.match.findMany({
      where: {
        project: { orgId: org.id, dataFrom: "REGISTER" },
        score: { gte: 70 },
        proposable: true,
        rejectedAt: null,
        ...window,
      },
      select: matchVmSelect,
      orderBy: [{ createdAt: "desc" }, { score: "desc" }],
    }),
    buildSentInfoMap(org.id),
  ]);
  const vm = matches.map((m) =>
    toMatchVM(m, sentMap.get(`${m.talent.id}#${m.project.id}`) ?? null),
  );

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">自社保有案件マッチ（手動）</h1>
        <p className="mt-1 text-sm text-muted">
          「自社保有案件」タブで登録した案件を、直近3日の人材と手動でマッチします。定期マッチには含まれません。
        </p>
      </div>

      <Card className="p-5">
        <p className="mb-2 text-xs text-muted">
          自社登録案件すべてを、自社＋直近3日に取り込んだ人材と突き合わせてマッチを計算・保存します（手動実行）。
        </p>
        <RematchButton scope="registered" label="自社案件マッチを実行" />
      </Card>

      <MatchesList matches={vm} days={daysParam} />
    </div>
  );
}
