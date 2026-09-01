import Link from "next/link";
import { getCurrentOrg } from "@/lib/current-org";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ProposalStatus } from "@prisma/client";
import { STAGE_KEYS, isStageKey, type StageKey } from "@/lib/pipeline";
import { ProposalPipeline, type PipelineVM } from "./pipeline-table";
import { RejectedTable, type RejectedVM } from "./rejected-table";
import { ProposalSearch } from "./proposal-search";
import { PipelineFilters } from "./pipeline-filters";
import { RejectionLearnings } from "./rejection-learnings";
import { MatchAnalysisChart, type DailyMatchStat } from "./analysis-chart";
import { DISPLAY_MIN_SCORE } from "@/lib/match-run";

export const metadata = { title: "提案管理 — Caduceus" };
export const dynamic = "force-dynamic";

const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT: "下書き",
  SENT: "送信済み",
  ACCEPTED: "受諾",
  REJECTED: "見送り",
};
const PROPOSAL_STATUS_TONE: Record<ProposalStatus, "slate" | "blue" | "green" | "red"> = {
  DRAFT: "slate",
  SENT: "blue",
  ACCEPTED: "green",
  REJECTED: "red",
};

type Tab = "pipeline" | "rejected" | "proposals" | "analysis";

export default async function ProposalsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const tabParam = (typeof sp.tab === "string" ? sp.tab : "") as Tab;
  const tab: Tab = ["pipeline", "rejected", "proposals", "analysis"].includes(tabParam)
    ? tabParam
    : "pipeline";
  const q = (typeof sp.q === "string" ? sp.q : "").trim().toLowerCase();
  const matchQ = (...parts: (string | null | undefined)[]) =>
    !q || parts.filter(Boolean).join(" ").toLowerCase().includes(q);
  // パイプライン用フィルタ: 進捗(stage)・期間(period)。
  const stageParam = typeof sp.stage === "string" ? sp.stage : "";
  const periodParam = typeof sp.period === "string" ? sp.period : "";
  const periodDays = ["7", "30", "90"].includes(periodParam) ? Number(periodParam) : 0;
  const periodCutoff = periodDays > 0 ? Date.now() - periodDays * 24 * 60 * 60 * 1000 : 0;
  const org = await getCurrentOrg();

  // --- メール送信したマッチ（パイプライン） ---
  const sent = await prisma.sentEmail.findMany({
    where: {
      orgId: org.id,
      status: "SENT",
      kind: { in: ["PROJECT_INFO", "TALENT_PROPOSAL"] },
    },
    select: { talentId: true, projectId: true, kind: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 2000, // パイプラインは直近分のみ。全件ロードを防ぐ（データ増の時限爆弾対策）。
  });
  const sentMap = new Map<string, { info?: Date; proposal?: Date }>();
  for (const s of sent) {
    if (!s.talentId || !s.projectId) continue;
    const k = `${s.talentId}#${s.projectId}`;
    const e = sentMap.get(k) ?? {};
    if (s.kind === "PROJECT_INFO" && !e.info) e.info = s.createdAt;
    if (s.kind === "TALENT_PROPOSAL" && !e.proposal) e.proposal = s.createdAt;
    sentMap.set(k, e);
  }
  const pairs = [...sentMap.keys()].slice(0, 300).map((k) => {
    const [talentId, projectId] = k.split("#");
    return { talentId, projectId };
  });
  const pipelineMatches = pairs.length
    ? await prisma.match.findMany({
        where: {
          rejectedAt: null,
          OR: pairs.map((p) => ({ talentId: p.talentId, projectId: p.projectId })),
        },
        include: {
          talent: { select: { id: true, name: true } },
          project: { select: { id: true, title: true, clientName: true } },
        },
      })
    : [];
  const pipelineRows: PipelineVM[] = pipelineMatches
    .map((m) => {
      const e = sentMap.get(`${m.talentId}#${m.projectId}`) ?? {};
      const stages = Object.fromEntries(
        STAGE_KEYS.map((key) => [key, !!(m as unknown as Record<string, Date | null>)[key]]),
      ) as Record<StageKey, boolean>;
      return {
        row: {
          id: m.id,
          score: m.score,
          talentId: m.talent.id,
          talentName: m.talent.name,
          projectId: m.project.id,
          projectTitle: m.project.title,
          clientName: m.project.clientName,
          sentInfoAt: e.info ? e.info.toISOString() : null,
          sentTalentAt: e.proposal ? e.proposal.toISOString() : null,
          stages,
        } satisfies PipelineVM,
        sortMs: Math.max(e.info?.getTime() ?? 0, e.proposal?.getTime() ?? 0),
      };
    })
    .sort((a, b) => b.sortMs - a.sortMs)
    .map((x) => x.row)
    .filter((r) => matchQ(r.projectTitle, r.clientName, r.talentName))
    .filter((r) => {
      // メールを送ったものだけ表示（案内 or 提案のどちらも未送信なら除外）。
      if (!r.sentInfoAt && !r.sentTalentAt) return false;
      // 進捗フィルタ
      if (stageParam === "none") {
        if (STAGE_KEYS.some((k) => r.stages[k])) return false;
      } else if (isStageKey(stageParam)) {
        if (!r.stages[stageParam]) return false;
      }
      // 期間フィルタ（送信日＝案内/提案の新しい方）
      if (periodCutoff > 0) {
        const sent = Math.max(
          r.sentInfoAt ? Date.parse(r.sentInfoAt) : 0,
          r.sentTalentAt ? Date.parse(r.sentTalentAt) : 0,
        );
        if (sent < periodCutoff) return false;
      }
      return true;
    });

  // --- 差し戻し済み ---
  const rejectedMatches = await prisma.match.findMany({
    where: { rejectedAt: { not: null }, talent: { orgId: org.id } },
    include: {
      talent: { select: { id: true, name: true } },
      project: { select: { id: true, title: true, clientName: true } },
    },
    orderBy: { rejectedAt: "desc" },
    take: 500, // 差し戻しは直近500件まで表示（全件ロード防止）。
  });
  const rejectedRows: RejectedVM[] = rejectedMatches
    .map((m) => ({
      id: m.id,
      score: m.score,
      talentId: m.talent.id,
      talentName: m.talent.name,
      projectId: m.project.id,
      projectTitle: m.project.title,
      clientName: m.project.clientName,
      rejectedAt: m.rejectedAt ? m.rejectedAt.toISOString() : null,
      rejectReason: m.rejectReason,
    }))
    .filter((r) => matchQ(r.projectTitle, r.clientName, r.talentName));

  // --- 提案文（既存 Proposal） ---
  const proposalsAll = await prisma.proposal.findMany({
    where: { orgId: org.id },
    include: {
      talent: { select: { id: true, name: true } },
      project: { select: { id: true, title: true, clientName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 1000, // 提案文は直近1000件まで（全件ロード防止）。
  });
  const proposals = proposalsAll.filter((p) =>
    matchQ(p.project.title, p.project.clientName, p.talent.name),
  );

  // --- 分析: 日別のマッチ件数と、その内訳（提案／差し戻し）---
  // 母数は「マッチ一覧」に出るものと揃える: 他社人材(PARTNER)・自社登録案件(REGISTER)を除く・
  // 表示スコア以上(DISPLAY_MIN_SCORE=80)・商流提案可(proposable)。差し戻し済みも母数に含める
  // （元々一覧に出ていて差し戻したもの）。マッチ日(Match.createdAt・JST)で日別集計。直近60日。
  // proposed=差し戻しでなく、案内/提案メールを送信済み（SentEmailにSENTがある）ペア。
  // createdAt は timestamp(tzなし)＝UTC値。UTCとみなしてからJSTへ2段変換する。
  // 単段の `AT TIME ZONE 'Asia/Tokyo'` はUTC値をJSTとみなす逆変換になり、JST午前の件数が前日にズレる。
  const dailyStats = await prisma.$queryRaw<DailyMatchStat[]>`
    SELECT to_char(m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS day,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE m."rejectedAt" IS NOT NULL)::int AS rejected,
           COUNT(*) FILTER (
             WHERE m."rejectedAt" IS NULL AND EXISTS (
               SELECT 1 FROM "SentEmail" s
               WHERE s."talentId" = m."talentId" AND s."projectId" = m."projectId"
                 AND s.status = 'SENT' AND s.kind IN ('PROJECT_INFO', 'TALENT_PROPOSAL')
             )
           )::int AS proposed
    FROM "Match" m
    JOIN "Talent" t ON t.id = m."talentId"
    JOIN "Project" p ON p.id = m."projectId"
    WHERE t."orgId" = ${org.id}
      AND t."talentType"::text = 'PARTNER'
      AND p."dataFrom"::text <> 'REGISTER'
      AND m.score >= ${DISPLAY_MIN_SCORE}
      AND m.proposable = true
      AND m."createdAt" >= NOW() - INTERVAL '60 days'
    GROUP BY day
    ORDER BY day ASC
  `;

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: "pipeline", label: "パイプライン", count: pipelineRows.length },
    { value: "rejected", label: "差し戻し済み", count: rejectedRows.length },
    { value: "proposals", label: "提案文", count: proposals.length },
    { value: "analysis", label: "分析", count: dailyStats.reduce((s, d) => s + d.total, 0) },
  ];

  return (
    <div className="flex min-h-full flex-col gap-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">提案管理</h1>
        <Link href="/matches" className="text-sm text-primary hover:underline">
          マッチ一覧へ →
        </Link>
      </div>

      {/* 検索 */}
      <ProposalSearch initial={typeof sp.q === "string" ? sp.q : ""} />

      {/* タブ */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => {
          const active = tab === t.value;
          const params = new URLSearchParams();
          if (t.value !== "pipeline") params.set("tab", t.value);
          if (q) params.set("q", typeof sp.q === "string" ? sp.q : "");
          const qs = params.toString();
          return (
            <Link
              key={t.value}
              href={qs ? `/proposals?${qs}` : "/proposals"}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
                active ? "border-b-2 border-primary text-primary" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-xs text-slate-400">{t.count}</span>
            </Link>
          );
        })}
      </div>

      {tab === "pipeline" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="px-1 text-xs text-muted">
              メールを送信したマッチの進捗を、各段階のチェックで管理できます（チェックは自動保存）。
            </p>
            <PipelineFilters stage={stageParam} period={periodParam} />
          </div>
          <ProposalPipeline rows={pipelineRows} />
        </>
      )}

      {tab === "rejected" && (
        <>
          <RejectionLearnings
            learnings={org.matchLearnings ?? null}
            updatedAt={org.matchLearningsAt ? org.matchLearningsAt.toISOString() : null}
          />
          <p className="px-1 text-xs text-muted">
            送らずに差し戻したマッチと理由の記録です。「一覧に戻す」で再び送信対象にできます。
          </p>
          <RejectedTable rows={rejectedRows} />
        </>
      )}

      {tab === "proposals" && (
        <>
          {proposals.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted">
              生成した提案文はまだありません。
              <Link href="/matching" className="ml-1 text-primary underline">
                マッチング画面で提案文を生成
              </Link>
              できます。
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-slate-50">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">案件</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">人材</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">ステータス</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">作成日</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {proposals.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        <Link href={`/projects/${p.project.id}`} className="hover:text-primary hover:underline">
                          {p.project.title}
                        </Link>
                        {p.project.clientName && (
                          <div className="mt-0.5 text-xs text-slate-400">{p.project.clientName}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <Link href={`/talent/${p.talent.id}`} className="hover:text-primary hover:underline">
                          {p.talent.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={PROPOSAL_STATUS_TONE[p.status]}>{PROPOSAL_STATUS_LABELS[p.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {p.createdAt.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/proposals/${p.id}`} className="text-xs text-primary hover:underline">
                          詳細
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {tab === "analysis" && (
        <>
          <p className="px-1 text-xs text-muted">
            日別のマッチ件数と、その内訳（提案／差し戻し／未対応）。直近60日・マッチ日基準。
          </p>
          <MatchAnalysisChart data={dailyStats} />
        </>
      )}
    </div>
  );
}
