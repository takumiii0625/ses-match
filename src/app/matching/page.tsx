import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { scoreMatch, prefilterCandidates, isSameCompany } from "@/lib/matching";
import { getAI } from "@/lib/ai";
import type { RankedCandidate } from "@/lib/ai";
import { formatRate } from "@/lib/utils";
import { REMOTE_LABELS, TALENT_STATUS_LABELS } from "@/lib/enums";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MatchRunner } from "./match-runner";
import { RematchButton } from "./rematch-button";
import { ProposalButton } from "./proposal-button";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ projectId?: string; mode?: string }>;
}

const REC_LABELS: Record<string, string> = {
  STRONG: "最有力",
  POSSIBLE: "提案検討",
  WEAK: "ミスマッチ大",
  UNFIT: "不適合",
};
const REC_TONE: Record<string, "green" | "blue" | "amber" | "slate"> = {
  STRONG: "green",
  POSSIBLE: "blue",
  WEAK: "amber",
  UNFIT: "slate",
};

function scoreBadgeTone(score: number): "green" | "amber" | "slate" {
  if (score >= 70) return "green";
  if (score >= 40) return "amber";
  return "slate";
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-400" : "bg-slate-300";
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

interface ViewRow {
  talentId: string;
  score: number;
  recommendation?: string;
  strengths: string[];
  concerns: string[];
}

export default async function MatchingPage({ searchParams }: PageProps) {
  const { projectId, mode: modeParam } = await searchParams;
  const aiAvailable = (process.env.AI_PROVIDER ?? "mock") !== "mock";
  const mode = modeParam === "score" ? "score" : aiAvailable ? "ai" : "score";

  const org = await getCurrentOrg();
  const projects = await prisma.project.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true },
  });

  if (!projectId) {
    return (
      <div className="p-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">マッチング</h1>
          <p className="text-sm text-muted mt-1">
            案件を選択すると、適合する人材を{aiAvailable ? "AIが判定し" : "スコア順に"}表示します。
          </p>
        </div>
        <Card className="p-5 space-y-4">
          <MatchRunner projects={projects} />
          <div className="border-t border-border pt-4">
            <p className="text-xs text-muted mb-2">
              個別案件を選ばず、全人材 × 全案件をまとめて再マッチします。
            </p>
            <RematchButton />
          </div>
        </Card>
        <div className="flex flex-col items-center justify-center py-20 text-muted">
          <p className="text-sm font-medium text-slate-400">案件を選択してください</p>
        </div>
      </div>
    );
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, orgId: org.id },
  });
  if (!project) {
    return (
      <div className="p-8 space-y-6">
        <h1 className="text-xl font-semibold text-foreground">マッチング</h1>
        <Card className="p-5">
          <MatchRunner projects={projects} selectedProjectId={projectId} />
        </Card>
        <p className="text-sm text-red-600">案件が見つかりません。</p>
      </div>
    );
  }

  const allTalents = await prisma.talent.findMany({ where: { orgId: org.id } });
  const talentById = new Map(allTalents.map((t) => [t.id, t]));

  // 同一企業（送信元ドメインが同じ）の人材は提案対象から除外
  const talents = allTalents.filter((t) => !isSameCompany(t, project));
  const sameCompanyExcluded = allTalents.length - talents.length;

  // --- compute results per mode ---
  let rows: ViewRow[] = [];
  let aiError: string | null = null;
  let prefilteredOut = 0;

  if (mode === "ai") {
    const shortlist = prefilterCandidates(project, talents, 30);
    prefilteredOut = talents.length - shortlist.length;
    if (shortlist.length > 0) {
      try {
        const ranked: RankedCandidate[] = await getAI().rankCandidates(
          {
            title: project.title,
            clientName: project.clientName,
            requiredSkills: project.requiredSkills,
            rateMin: project.rateMin,
            rateMax: project.rateMax,
            remotePreference: project.remotePreference,
            location: project.location,
            startText: project.startText,
            description: project.description,
          },
          shortlist.map(({ talent: t }) => ({
            talentId: t.id,
            name: t.name,
            age: t.age,
            talentType: t.talentType,
            skills: [...new Set([...t.mainSkills, ...t.skills])],
            desiredRateMin: t.desiredRateMin,
            desiredRateMax: t.desiredRateMax,
            remotePreference: t.remotePreference,
            availabilityText: t.availabilityText,
            nearestStation: t.nearestStation,
            note: t.note,
          })),
          org.matchPrompt ?? undefined,
        );
        rows = ranked
          .filter((r) => talentById.has(r.talentId))
          .map((r) => ({
            talentId: r.talentId,
            score: r.score,
            recommendation: r.recommendation,
            strengths: r.strengths,
            concerns: r.concerns,
          }));
      } catch (e) {
        aiError = e instanceof Error ? e.message : String(e);
      }
    }
  }

  // score mode, or AI fallback on error
  if (mode === "score" || aiError) {
    rows = talents
      .map((t) => {
        const { score, reasons } = scoreMatch(t, project);
        return { talentId: t.id, score, strengths: reasons, concerns: [] };
      })
      .sort((a, b) => b.score - a.score);
  }

  const modePill = (m: "ai" | "score", label: string) => {
    const active = mode === m;
    return (
      <Link
        href={`/matching?projectId=${projectId}&mode=${m}`}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          active ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">マッチング</h1>
        <p className="text-sm text-muted mt-1">
          {mode === "ai"
            ? "必須スキルで候補を絞り込み、AIが適合度を判定しています。"
            : "スコア計算（関数）で適合度を算出しています。"}
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <MatchRunner projects={projects} selectedProjectId={projectId} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">判定方法:</span>
          {aiAvailable && modePill("ai", "AI判定")}
          {modePill("score", "スコア計算")}
        </div>
        <div className="border-t border-border pt-4">
          <RematchButton />
        </div>
      </Card>

      {/* Project summary */}
      <Card className="p-5">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="font-semibold text-foreground">{project.title}</span>
          {project.clientName && (
            <span className="text-muted">クライアント: {project.clientName}</span>
          )}
          {(project.rateMin != null || project.rateMax != null) && (
            <span className="text-muted">単価: {formatRate(project.rateMin, project.rateMax)}</span>
          )}
          {project.remotePreference && (
            <Badge tone="blue">
              {REMOTE_LABELS[project.remotePreference] ?? project.remotePreference}
            </Badge>
          )}
          {project.requiredSkills.length > 0 && (
            <div className="w-full flex flex-wrap gap-1 mt-1">
              <span className="text-xs text-muted self-center">必須スキル:</span>
              {project.requiredSkills.map((s) => (
                <Badge key={s} tone="indigo">{s}</Badge>
              ))}
            </div>
          )}
        </div>
      </Card>

      {aiError && (
        <div className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700">
          AI判定でエラーが発生したため、スコア計算で表示しています（{aiError}）。
        </div>
      )}

      <div className="text-sm text-muted font-medium px-1">
        {rows.length} 件
        {mode === "ai" && prefilteredOut > 0 && (
          <span className="ml-2 text-xs">
            （必須スキル不一致で {prefilteredOut} 件を除外）
          </span>
        )}
        {sameCompanyExcluded > 0 && (
          <span className="ml-2 text-xs text-amber-600">
            （同一企業のため {sameCompanyExcluded} 件を除外）
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">
          {mode === "ai"
            ? "必須スキルに合致する候補がいません。"
            : "人材データがありません。"}
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row, idx) => {
            const talent = talentById.get(row.talentId)!;
            return (
              <Card key={row.talentId} className="p-5">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 text-center">
                    <span className="text-lg font-bold text-slate-300">{idx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Link
                        href={`/talent/${talent.id}`}
                        className="font-semibold text-foreground hover:text-primary hover:underline"
                      >
                        {talent.name}
                      </Link>
                      <Badge tone={scoreBadgeTone(row.score)} className="tabular-nums">
                        {row.score}点
                      </Badge>
                      {row.recommendation && (
                        <Badge tone={REC_TONE[row.recommendation] ?? "slate"}>
                          {REC_LABELS[row.recommendation] ?? row.recommendation}
                        </Badge>
                      )}
                      {talent.status !== "NONE" && (
                        <Badge tone="slate">
                          {TALENT_STATUS_LABELS[talent.status] ?? talent.status}
                        </Badge>
                      )}
                    </div>

                    <ScoreBar score={row.score} />

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      {(talent.desiredRateMin != null || talent.desiredRateMax != null) && (
                        <span>希望単価: {formatRate(talent.desiredRateMin, talent.desiredRateMax)}</span>
                      )}
                      {talent.availabilityText && <span>稼働開始: {talent.availabilityText}</span>}
                      {talent.remotePreference && (
                        <span>{REMOTE_LABELS[talent.remotePreference] ?? talent.remotePreference}</span>
                      )}
                      {talent.nearestStation && <span>最寄: {talent.nearestStation}</span>}
                    </div>

                    {(talent.mainSkills.length > 0 || talent.skills.length > 0) && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {talent.mainSkills.map((s) => (
                          <Badge key={s} tone="blue">{s}</Badge>
                        ))}
                        {talent.skills
                          .filter((s) => !talent.mainSkills.includes(s))
                          .slice(0, 6)
                          .map((s) => (
                            <Badge key={s} tone="slate">{s}</Badge>
                          ))}
                      </div>
                    )}

                    {/* strengths (green) */}
                    {row.strengths.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {row.strengths.map((r, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 text-xs text-emerald-700"
                          >
                            ✓ {r}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* concerns (amber) */}
                    {row.concerns.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {row.concerns.map((r, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center rounded-full bg-amber-50 border border-amber-100 px-2.5 py-0.5 text-xs text-amber-700"
                          >
                            ⚠ {r}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-3">
                      <ProposalButton talentId={talent.id} projectId={projectId} />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
