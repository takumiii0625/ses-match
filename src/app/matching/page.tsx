import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { scoreMatch } from "@/lib/matching";
import { formatRate } from "@/lib/utils";
import { REMOTE_LABELS, TALENT_STATUS_LABELS } from "@/lib/enums";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MatchRunner } from "./match-runner";
import { ProposalButton } from "./proposal-button";

interface PageProps {
  searchParams: Promise<{ projectId?: string }>;
}

function scoreBadgeTone(score: number): "green" | "amber" | "slate" {
  if (score >= 70) return "green";
  if (score >= 40) return "amber";
  return "slate";
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70
      ? "bg-emerald-500"
      : score >= 40
        ? "bg-amber-400"
        : "bg-slate-300";
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

export default async function MatchingPage({ searchParams }: PageProps) {
  const { projectId } = await searchParams;

  const org = await getCurrentOrg();

  // Load all projects for selector
  const projects = await prisma.project.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true },
  });

  // If no project selected, just show the selector
  if (!projectId) {
    return (
      <div className="p-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">マッチング</h1>
          <p className="text-sm text-muted mt-1">
            案件を選択すると、適合する人材をスコア順に表示します。
          </p>
        </div>
        <Card className="p-5">
          <MatchRunner projects={projects} />
        </Card>
        <div className="flex flex-col items-center justify-center py-20 text-muted">
          <svg
            className="w-12 h-12 mb-4 text-slate-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7"
            />
          </svg>
          <p className="text-sm font-medium text-slate-400">案件を選択してください</p>
        </div>
      </div>
    );
  }

  // Load selected project
  const project = await prisma.project.findFirst({
    where: { id: projectId, orgId: org.id },
  });

  if (!project) {
    return (
      <div className="p-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">マッチング</h1>
        </div>
        <Card className="p-5">
          <MatchRunner projects={projects} selectedProjectId={projectId} />
        </Card>
        <p className="text-sm text-red-600">案件が見つかりません。</p>
      </div>
    );
  }

  // Load all talents in org
  const talents = await prisma.talent.findMany({
    where: { orgId: org.id },
  });

  // Compute scores
  const results = talents
    .map((talent) => {
      const { score, reasons } = scoreMatch(talent, project);
      return { talent, score, reasons };
    })
    .sort((a, b) => b.score - a.score);

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">マッチング</h1>
        <p className="text-sm text-muted mt-1">
          人材をスコア順に表示しています。「マッチング実行＆保存」でDBへ永続化できます。
        </p>
      </div>

      {/* Runner / selector */}
      <Card className="p-5">
        <MatchRunner projects={projects} selectedProjectId={projectId} />
      </Card>

      {/* Project summary */}
      <Card className="p-5">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="font-semibold text-foreground">{project.title}</span>
          {project.clientName && (
            <span className="text-muted">クライアント: {project.clientName}</span>
          )}
          {(project.rateMin != null || project.rateMax != null) && (
            <span className="text-muted">
              単価: {formatRate(project.rateMin, project.rateMax)}
            </span>
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

      {/* Results */}
      <div className="space-y-1 text-sm text-muted font-medium px-1">
        {results.length} 件の人材 — スコア順
      </div>

      {results.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">
          人材データがありません。先に人材を登録してください。
        </Card>
      ) : (
        <div className="space-y-3">
          {results.map(({ talent, score, reasons }, idx) => (
            <Card key={talent.id} className="p-5">
              <div className="flex items-start gap-4">
                {/* Rank */}
                <div className="flex-shrink-0 w-8 text-center">
                  <span className="text-lg font-bold text-slate-300">
                    {idx + 1}
                  </span>
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-foreground">
                      {talent.name}
                    </span>
                    {/* Score badge */}
                    <Badge tone={scoreBadgeTone(score)} className="tabular-nums">
                      {score}点
                    </Badge>
                    {talent.status !== "NONE" && (
                      <Badge tone="slate">
                        {TALENT_STATUS_LABELS[talent.status] ?? talent.status}
                      </Badge>
                    )}
                    {talent.remotePreference && (
                      <Badge tone="slate">
                        {REMOTE_LABELS[talent.remotePreference] ?? talent.remotePreference}
                      </Badge>
                    )}
                  </div>

                  {/* Score bar */}
                  <ScoreBar score={score} />

                  {/* Talent summary */}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    {(talent.desiredRateMin != null || talent.desiredRateMax != null) && (
                      <span>希望単価: {formatRate(talent.desiredRateMin, talent.desiredRateMax)}</span>
                    )}
                    {talent.availabilityText && (
                      <span>稼働開始: {talent.availabilityText}</span>
                    )}
                    {talent.nearestStation && (
                      <span>最寄: {talent.nearestStation}</span>
                    )}
                  </div>

                  {/* Skills */}
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

                  {/* Match reasons */}
                  {reasons.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {reasons.map((r, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center rounded-full bg-blue-50 border border-blue-100 px-2.5 py-0.5 text-xs text-blue-700"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Proposal button */}
                  <div className="mt-3">
                    <ProposalButton talentId={talent.id} projectId={projectId} />
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
