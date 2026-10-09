import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { formatRate, daysAgo } from "@/lib/utils";
import { dedupeLatest, talentDedupeKey } from "@/lib/dedupe";
import { requiredLanguages, talentLanguages } from "@/lib/matching";
import { parseMatchConfig } from "@/lib/match-config";
import { MatchConfigPanel } from "./match-config-panel";
import { REMOTE_LABELS } from "@/lib/enums";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MatchRunner } from "./match-runner";
import { ProposalButton } from "./proposal-button";
import { ProjectMatchList, type ProjectMatchVM } from "./project-match-list";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ projectId?: string }>;
}

export default async function MatchingPage({ searchParams }: PageProps) {
  const { projectId } = await searchParams;

  const org = await getCurrentOrg();
  const matchConfig = parseMatchConfig(org.matchConfig);
  const projects = await prisma.project.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true },
  });

  if (!projectId) {
    return (
      <div className="space-y-6 p-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">マッチング設定</h1>
          <p className="mt-1 text-sm text-muted">
            マッチの除外ルール・単価許容・比重などを設定します。マッチの実行は日次自動マッチと各マッチ画面で行います。
            案件を選ぶと、その案件の保存済みマッチ結果を確認できます。
          </p>
        </div>
        <MatchConfigPanel initialConfig={matchConfig} initialRateTolerance={org.rateToleranceMan} />
        <Card className="p-5">
          <p className="mb-2 text-xs font-medium text-slate-500">案件の保存済みマッチを確認</p>
          <MatchRunner projects={projects} />
        </Card>
        <div className="flex flex-col items-center justify-center py-16 text-muted">
          <p className="text-sm font-medium text-slate-400">案件を選択すると結果を表示します</p>
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
        <h1 className="text-xl font-semibold text-foreground">マッチング設定</h1>
        <Card className="p-5">
          <MatchRunner projects={projects} selectedProjectId={projectId} />
        </Card>
        <p className="text-sm text-red-600">案件が見つかりません。</p>
      </div>
    );
  }

  // 保存済みマッチ（DB）をそのまま表示。LLMはここでは動かさない。80点以上のみ。
  const rawMatches = await prisma.match.findMany({
    where: { projectId: project.id, talent: { orgId: org.id }, score: { gte: 80 } },
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
        <h1 className="text-xl font-semibold text-foreground">マッチング設定</h1>
        <p className="mt-1 text-sm text-muted">
          保存済みのマッチ結果を表示しています。最新化するには「AIで再判定」を実行してください。
        </p>
      </div>

      <MatchConfigPanel initialConfig={matchConfig} initialRateTolerance={org.rateToleranceMan} />

      <Card className="p-5">
        <p className="mb-2 text-xs font-medium text-slate-500">案件の保存済みマッチを確認</p>
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

      {matches.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">
          この案件の保存済みマッチはまだありません。上の「AIで再判定」を押すと、
          全人材との適合度をAIが判定して保存します。
        </Card>
      ) : (
        (() => {
          // 言語ゲート表示用: 案件の要求言語（包含展開済み）と、各人材が満たす数を算出。
          const projLangs = requiredLanguages(project);
          const vms: ProjectMatchVM[] = matches.map(({ item: m, dupes }) => {
            const tLangs = talentLanguages(m.talent);
            let langHit = 0;
            for (const l of projLangs) if (tLangs.has(l)) langHit++;
            return {
              id: m.id,
              score: m.score,
              reasons: m.reasons,
              proposable: m.proposable,
              channelNote: m.channelNote,
              dupes,
              talent: {
                id: m.talent.id,
                name: m.talent.name,
                status: m.talent.status,
                desiredRateMin: m.talent.desiredRateMin,
                desiredRateMax: m.talent.desiredRateMax,
                availabilityText: m.talent.availabilityText,
                remotePreference: m.talent.remotePreference,
                nearestStation: m.talent.nearestStation,
                affiliation: m.talent.affiliation,
                mainSkills: m.talent.mainSkills,
                skills: m.talent.skills,
                receivedDate: m.talent.receivedDate ? m.talent.receivedDate.toISOString() : null,
                langReq: projLangs.size,
                langHit,
              },
            };
          });
          // ProposalButton はクライアント境界をまたぐので、サーバーで生成して talentId で渡す。
          const proposalSlot = Object.fromEntries(
            vms.map((v) => [
              v.talent.id,
              <ProposalButton key={v.talent.id} talentId={v.talent.id} projectId={projectId} />,
            ]),
          );
          return (
            <ProjectMatchList
              matches={vms}
              projectRateMax={project.rateMax}
              initialTolerance={org.rateToleranceMan}
              initialLanguageMatchAll={org.languageMatchAll}
              proposalSlot={proposalSlot}
            />
          );
        })()
      )}
    </div>
  );
}
