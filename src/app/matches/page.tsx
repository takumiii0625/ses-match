import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { DEFAULT_MATCH_PROMPT } from "@/lib/ai/prompts";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MatchesList } from "./matches-list";
import { toMatchVM, matchVmSelect, buildSentInfoMap } from "./serialize";

export const metadata = { title: "マッチ一覧 — Caduceus" };
export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

export default async function MatchesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const daysParam = (Array.isArray(sp.days) ? sp.days[0] : sp.days) ?? "1";
  // 配信日の窓: 既定は直近1日。"all" は全期間。
  const days = daysParam === "all" ? 0 : Number(daysParam) || 1;
  const org = await getCurrentOrg();

  const projectWhere =
    days > 0
      ? { orgId: org.id, receivedDate: { gte: new Date(Date.now() - days * DAY) } }
      : { orgId: org.id };

  const [matches, sentMap] = await Promise.all([
    prisma.match.findMany({
      // 提案不可（商流オーバー等）・差し戻し済みはマッチ一覧に出さない。配信日で絞る。
      where: { project: projectWhere, score: { gte: 80 }, proposable: true, rejectedAt: null },
      select: matchVmSelect,
      orderBy: { score: "desc" },
    }),
    buildSentInfoMap(org.id),
  ]);

  const vm = matches.map((m) =>
    toMatchVM(m, sentMap.get(`${m.talent.id}#${m.project.id}`) ?? null),
  );

  const activePrompt = org.matchPrompt ?? DEFAULT_MATCH_PROMPT;
  const usingDefault = !org.matchPrompt;

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">マッチ一覧</h1>
          <p className="mt-1 text-sm text-muted">
            案件ごとのマッチ結果。既定は<span className="font-medium">配信が直近1日</span>の案件のみ。
            過去日は右の「配信日」で広げられます。
          </p>
        </div>
        <Link
          href="/matching"
          className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
        >
          マッチングを実行 →
        </Link>
      </div>

      {/* 使用中のマッチ判定プロンプト（折りたたみ） */}
      <Card className="overflow-hidden p-0">
        <details>
          <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <span>マッチ判定に使用中のプロンプト</span>
            <Badge tone={usingDefault ? "slate" : "indigo"}>
              {usingDefault ? "デフォルト" : "カスタム"}
            </Badge>
            <span className="ml-auto text-xs font-normal text-muted">クリックで展開</span>
          </summary>
          <div className="border-t border-border px-5 py-4">
            <p className="mb-3 text-xs text-muted">
              点数・推奨度・合致点／懸念点はこの指示に基づいてLLMが判定します。編集は
              <Link href="/settings" className="text-primary underline">
                設定
              </Link>
              から。
            </p>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700">
              {activePrompt}
            </pre>
          </div>
        </details>
      </Card>

      <MatchesList matches={vm} days={daysParam} />
    </div>
  );
}
