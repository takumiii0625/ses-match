import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { DEFAULT_MATCH_PROMPT } from "@/lib/ai/prompts";
import { formatRate } from "@/lib/utils";
import { REMOTE_LABELS } from "@/lib/enums";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const metadata = { title: "マッチ一覧 — SES Match" };
export const dynamic = "force-dynamic";

function scoreBadgeTone(score: number): "green" | "amber" | "slate" {
  if (score >= 70) return "green";
  if (score >= 40) return "amber";
  return "slate";
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-400" : "bg-slate-300";
  return (
    <div className="mt-1 h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, score)}%` }} />
    </div>
  );
}

/** reasons[] を「合致点(strengths)」と「懸念点(concerns)」に振り分ける。 */
function splitReasons(reasons: string[]): { strengths: string[]; concerns: string[] } {
  const strengths: string[] = [];
  const concerns: string[] = [];
  for (const r of reasons) {
    if (r.startsWith("懸念:")) concerns.push(r.replace(/^懸念:\s*/, ""));
    else strengths.push(r);
  }
  return { strengths, concerns };
}

export default async function MatchesPage() {
  const org = await getCurrentOrg();

  const matches = await prisma.match.findMany({
    where: { project: { orgId: org.id } },
    include: { talent: true, project: true },
    orderBy: { score: "desc" },
  });

  // 案件ごとにグループ化（案件は最高スコア順に並べる）。
  const byProject = new Map<
    string,
    { project: (typeof matches)[number]["project"]; rows: typeof matches }
  >();
  for (const m of matches) {
    const g = byProject.get(m.projectId);
    if (g) g.rows.push(m);
    else byProject.set(m.projectId, { project: m.project, rows: [m] });
  }
  const groups = [...byProject.values()].sort(
    (a, b) => (b.rows[0]?.score ?? 0) - (a.rows[0]?.score ?? 0),
  );

  const activePrompt = org.matchPrompt ?? DEFAULT_MATCH_PROMPT;
  const usingDefault = !org.matchPrompt;

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
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
      <Card className="p-0 overflow-hidden">
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

      <div className="px-1 text-sm font-medium text-muted">
        {matches.length} 件のマッチ（{groups.length} 案件）
      </div>

      {groups.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">
          まだ保存済みのマッチがありません。
          <Link href="/matching" className="ml-1 text-primary underline">
            マッチングを実行
          </Link>
          してください。
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(({ project, rows }) => (
            <Card key={project.id} className="overflow-hidden p-0">
              {/* 案件ヘッダー */}
              <div className="border-b border-border bg-slate-50/60 px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`/projects/${project.id}`}
                    className="font-semibold text-foreground hover:text-primary hover:underline"
                  >
                    {project.title}
                  </Link>
                  <Badge tone="slate">{rows.length}名マッチ</Badge>
                  {project.clientName && (
                    <span className="text-xs text-muted">
                      クライアント: {project.clientName}
                    </span>
                  )}
                  {(project.rateMin != null || project.rateMax != null) && (
                    <span className="text-xs text-muted">
                      単価: {formatRate(project.rateMin, project.rateMax)}
                    </span>
                  )}
                </div>
                {project.requiredSkills.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span className="text-xs text-muted">必須スキル:</span>
                    {project.requiredSkills.map((s) => (
                      <Badge key={s} tone="indigo">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* マッチ人材 */}
              <div className="divide-y divide-border">
                {rows.map((m) => {
                  const { strengths, concerns } = splitReasons(m.reasons);
                  const t = m.talent;
                  return (
                    <div key={m.id} className="flex items-start gap-4 px-5 py-4">
                      <div className="w-14 shrink-0 text-center">
                        <div className="text-lg font-bold tabular-nums text-slate-700">
                          {Math.round(m.score)}
                          <span className="text-xs font-normal text-slate-400">点</span>
                        </div>
                        <ScoreBar score={m.score} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/talent/${t.id}`}
                            className="font-semibold text-foreground hover:text-primary hover:underline"
                          >
                            {t.name}
                          </Link>
                          <Badge tone={scoreBadgeTone(m.score)} className="tabular-nums">
                            {Math.round(m.score)}点
                          </Badge>
                          {(t.desiredRateMin != null || t.desiredRateMax != null) && (
                            <span className="text-xs text-muted">
                              希望単価: {formatRate(t.desiredRateMin, t.desiredRateMax)}
                            </span>
                          )}
                          {t.remotePreference && (
                            <span className="text-xs text-muted">
                              {REMOTE_LABELS[t.remotePreference] ?? t.remotePreference}
                            </span>
                          )}
                        </div>

                        {/* スキル */}
                        {(t.mainSkills.length > 0 || t.skills.length > 0) && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {t.mainSkills.map((s) => (
                              <Badge key={s} tone="blue">
                                {s}
                              </Badge>
                            ))}
                            {t.skills
                              .filter((s) => !t.mainSkills.includes(s))
                              .slice(0, 6)
                              .map((s) => (
                                <Badge key={s} tone="slate">
                                  {s}
                                </Badge>
                              ))}
                          </div>
                        )}

                        {/* マッチ根拠（何を基準にマッチしたか） */}
                        {strengths.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1">
                            {strengths.map((r, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700"
                              >
                                ✓ {r}
                              </span>
                            ))}
                          </div>
                        )}
                        {concerns.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {concerns.map((r, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700"
                              >
                                ⚠ {r}
                              </span>
                            ))}
                          </div>
                        )}
                        {strengths.length === 0 && concerns.length === 0 && (
                          <p className="mt-2 text-xs text-slate-400">
                            判定根拠は記録されていません。
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
