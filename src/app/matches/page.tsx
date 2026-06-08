import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { DEFAULT_MATCH_PROMPT } from "@/lib/ai/prompts";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MatchesList, type MatchVM } from "./matches-list";

export const metadata = { title: "マッチ一覧 — SES Match" };
export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const org = await getCurrentOrg();

  const matches = await prisma.match.findMany({
    where: { project: { orgId: org.id } },
    include: { talent: true, project: true },
    orderBy: { score: "desc" },
  });

  // クライアント用に必要分だけ直列化。
  const vm: MatchVM[] = matches.map((m) => ({
    id: m.id,
    score: m.score,
    reasons: m.reasons,
    talent: {
      id: m.talent.id,
      name: m.talent.name,
      mainSkills: m.talent.mainSkills,
      skills: m.talent.skills,
      desiredRateMin: m.talent.desiredRateMin,
      desiredRateMax: m.talent.desiredRateMax,
      remotePreference: m.talent.remotePreference,
      receivedDate: m.talent.receivedDate ? m.talent.receivedDate.toISOString() : null,
    },
    project: {
      id: m.project.id,
      title: m.project.title,
      clientName: m.project.clientName,
      rateMin: m.project.rateMin,
      rateMax: m.project.rateMax,
      requiredSkills: m.project.requiredSkills,
      receivedDate: m.project.receivedDate ? m.project.receivedDate.toISOString() : null,
    },
  }));

  const activePrompt = org.matchPrompt ?? DEFAULT_MATCH_PROMPT;
  const usingDefault = !org.matchPrompt;

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">マッチ一覧</h1>
          <p className="mt-1 text-sm text-muted">
            保存済みのマッチ結果（取込後の自動マッチ・「全件マッチ」で生成）を案件ごとに表示します。
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

      <MatchesList matches={vm} />
    </div>
  );
}
