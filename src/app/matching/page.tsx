import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { formatRate, daysAgo } from "@/lib/utils";
import { dedupeLatest, talentDedupeKey } from "@/lib/dedupe";
import { channelStatus } from "@/lib/channel";
import { REMOTE_LABELS, TALENT_STATUS_LABELS } from "@/lib/enums";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MatchRunner } from "./match-runner";
import { RematchButton } from "./rematch-button";
import { ProposalButton } from "./proposal-button";

export const dynamic = "force-dynamic";

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
    score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-400" : "bg-slate-300";
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
    </div>
  );
}

function splitReasons(reasons: string[]) {
  const strengths: string[] = [];
  const concerns: string[] = [];
  for (const r of reasons) {
    if (r.startsWith("懸念:")) concerns.push(r.replace(/^懸念:\s*/, ""));
    else strengths.push(r);
  }
  return { strengths, concerns };
}

export default async function MatchingPage({ searchParams }: PageProps) {
  const { projectId } = await searchParams;

  const org = await getCurrentOrg();
  const projects = await prisma.project.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true },
  });

  if (!projectId) {
    return (
      <div className="space-y-6 p-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">マッチング</h1>
          <p className="mt-1 text-sm text-muted">
            案件を選ぶと、保存済みのマッチ結果を表示します。「AIで再判定」で最新化できます。
          </p>
        </div>
        <Card className="space-y-4 p-5">
          <MatchRunner projects={projects} />
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs text-muted">
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
      <div className="space-y-6 p-8">
        <h1 className="text-xl font-semibold text-foreground">マッチング</h1>
        <Card className="p-5">
          <MatchRunner projects={projects} selectedProjectId={projectId} />
        </Card>
        <p className="text-sm text-red-600">案件が見つかりません。</p>
      </div>
    );
  }

  // 保存済みマッチ（DB）をそのまま表示。LLMはここでは動かさない。70点以上のみ。
  const rawMatches = await prisma.match.findMany({
    where: { projectId: project.id, talent: { orgId: org.id }, score: { gte: 70 } },
    include: { talent: true },
    orderBy: { score: "desc" },
  });

  // 同一人材（氏名+主要スキル）をまとめ、最新配信を代表に。スコア順で表示。
  const matches = dedupeLatest(
    rawMatches,
    (m) => talentDedupeKey(m.talent.name, m.talent.mainSkills),
    (m) => (m.talent.receivedDate ? m.talent.receivedDate.toISOString() : null),
  ).sort((a, b) => b.item.score - a.item.score);

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">マッチング</h1>
        <p className="mt-1 text-sm text-muted">
          保存済みのマッチ結果を表示しています。最新化するには「AIで再判定」を実行してください。
        </p>
      </div>

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
            <span className="text-muted">単価: {formatRate(project.rateMin, project.rateMax)}</span>
          )}
          <span className="text-muted">配信: {daysAgo(project.receivedDate)}</span>
          {project.remotePreference && (
            <Badge tone="blue">
              {REMOTE_LABELS[project.remotePreference] ?? project.remotePreference}
            </Badge>
          )}
          {(project.channelText || project.supportFee) && (
            <div className="mt-1 flex w-full flex-wrap items-center gap-1.5">
              <span className="self-center text-xs text-muted">商流:</span>
              {project.channelText && <Badge tone="amber">{project.channelText}</Badge>}
              {project.supportFee && <Badge tone="green">支援費あり</Badge>}
            </div>
          )}
          {project.requiredSkills.length > 0 && (
            <div className="mt-1 flex w-full flex-wrap gap-1">
              <span className="self-center text-xs text-muted">必須スキル:</span>
              {project.requiredSkills.map((s) => (
                <Badge key={s} tone="indigo">{s}</Badge>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="px-1 text-sm font-medium text-muted">{matches.length} 件</div>

      {matches.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">
          この案件の保存済みマッチはまだありません。上の「AIで再判定」を押すと、
          全人材との適合度をAIが判定して保存します。
        </Card>
      ) : (
        <div className="space-y-3">
          {matches.map(({ item: m, dupes }, idx) => {
            const talent = m.talent;
            const { strengths, concerns } = splitReasons(m.reasons);
            return (
              <Card key={m.id} className="p-5">
                <div className="flex items-start gap-4">
                  <div className="w-8 flex-shrink-0 text-center">
                    <span className="text-lg font-bold text-slate-300">{idx + 1}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href={`/talent/${talent.id}`}
                        className="font-semibold text-foreground hover:text-primary hover:underline"
                      >
                        {talent.name}
                      </Link>
                      <Badge tone={scoreBadgeTone(m.score)} className="tabular-nums">
                        {Math.round(m.score)}点
                      </Badge>
                      {(() => {
                        const cs = channelStatus(m.proposable, m.channelNote);
                        return cs ? <Badge tone={cs.tone}>{cs.label}</Badge> : null;
                      })()}
                      {dupes > 1 && <Badge tone="slate">同一{dupes}件</Badge>}
                      {talent.status !== "NONE" && (
                        <Badge tone="slate">
                          {TALENT_STATUS_LABELS[talent.status] ?? talent.status}
                        </Badge>
                      )}
                    </div>

                    <ScoreBar score={m.score} />

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      {(talent.desiredRateMin != null || talent.desiredRateMax != null) && (
                        <span>希望単価: {formatRate(talent.desiredRateMin, talent.desiredRateMax)}</span>
                      )}
                      {talent.availabilityText && <span>稼働開始: {talent.availabilityText}</span>}
                      {talent.remotePreference && (
                        <span>{REMOTE_LABELS[talent.remotePreference] ?? talent.remotePreference}</span>
                      )}
                      {talent.nearestStation && <span>最寄: {talent.nearestStation}</span>}
                      {talent.affiliation && <span>所属: {talent.affiliation}</span>}
                      <span>配信: {daysAgo(talent.receivedDate)}</span>
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
                    {m.channelNote &&
                      (m.proposable ? (
                        <p className="mt-2 text-xs text-slate-500">商流: {m.channelNote}</p>
                      ) : (
                        <div className="mt-2">
                          <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs text-red-700">
                            提案不可の理由: {m.channelNote}
                          </span>
                        </div>
                      ))}

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
