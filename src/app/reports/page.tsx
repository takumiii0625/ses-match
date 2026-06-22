import { getCurrentOrg } from "@/lib/current-org";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { companyDomain } from "@/lib/matching";
import {
  TALENT_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  REMOTE_LABELS,
} from "@/lib/enums";

// ---------------------------------------------------------------------------
// Server-safe, non-interactive helper components
// ---------------------------------------------------------------------------

/** Single KPI / stat card */
function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card className="flex flex-col gap-1 p-5">
      <span className="text-xs text-muted font-medium tracking-wide uppercase">
        {label}
      </span>
      <span className="text-3xl font-bold text-foreground leading-none">
        {value}
      </span>
      {sub && <span className="text-xs text-muted mt-1">{sub}</span>}
    </Card>
  );
}

/** Horizontal proportional bar made of coloured segments */
function SegmentBar({
  segments,
}: {
  segments: { label: string; count: number; colorClass: string }[];
}) {
  const total = segments.reduce((s, x) => s + x.count, 0);
  if (total === 0) {
    return <p className="text-sm text-muted py-2">データなし</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {/* proportional bar */}
      <div className="flex h-5 w-full overflow-hidden rounded-full bg-border">
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <div
              key={s.label}
              className={s.colorClass}
              style={{ width: `${(s.count / total) * 100}%` }}
              title={`${s.label}: ${s.count}`}
            />
          ))}
      </div>
      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-1.5 text-xs text-slate-600"
          >
            <span
              className={`inline-block w-2.5 h-2.5 rounded-sm ${s.colorClass}`}
            />
            {s.label}
            <span className="font-semibold text-slate-800">{s.count}</span>
            <span className="text-muted">
              ({total > 0 ? Math.round((s.count / total) * 100) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Labeled horizontal bars (e.g. Top10 skills) */
function LabeledBars({
  items,
  max,
  colorClass,
}: {
  items: { label: string; count: number }[];
  max: number;
  colorClass: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted py-2">データなし</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="w-36 text-xs text-slate-700 truncate shrink-0 text-right">
            {item.label}
          </span>
          <div className="flex-1 h-5 rounded-full bg-border overflow-hidden">
            <div
              className={`h-full rounded-full ${colorClass}`}
              style={{
                width: `${max > 0 ? (item.count / max) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="w-8 text-right text-xs font-semibold text-slate-700 shrink-0">
            {item.count}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper card
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6 flex flex-col gap-4">
      <h2 className="text-sm font-bold text-slate-700 tracking-wide">
        {title}
      </h2>
      {children}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page (Server Component)
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

/** JSTの今日0時／今月1日0時（UTC Dateで返す） */
function jstBoundaries(): { todayStart: Date; monthStart: Date } {
  const JST_OFFSET = 9 * 60 * 60 * 1000;
  const jstNow = new Date(Date.now() + JST_OFFSET);
  const todayStart = new Date(
    Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate()) - JST_OFFSET,
  );
  const monthStart = new Date(
    Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), 1) - JST_OFFSET,
  );
  return { todayStart, monthStart };
}

const AI_TAG_LABELS: Record<string, string> = {
  extract: "メール分類・抽出",
  match: "マッチ判定",
  "project-email": "案件メール整形",
  proposal: "提案文生成",
  skillsheet: "スキルシート解析",
  "skillsheet-improve": "スキルシート改善",
  "rejection-analysis": "差し戻し分析",
};

// USD→JPY 換算レート（環境変数 USD_JPY_RATE で上書き可。既定160円/$）。
const USD_JPY = Number(process.env.USD_JPY_RATE ?? "160") || 160;
const fmtYen = (usd: number) => `¥${Math.round(usd * USD_JPY).toLocaleString("ja-JP")}`;
const fmtUsd = (usd: number, digits = 2) => `$${usd.toFixed(digits)}`;
/** 短い日付 M/D（曜日付き）。 */
function fmtDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = ["日", "月", "火", "水", "木", "金", "土"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d}(${dow})`;
}

export default async function ReportsPage() {
  const org = await getCurrentOrg();
  const orgId = org.id;
  const { todayStart, monthStart } = jstBoundaries();

  // Run all independent queries in parallel
  const [
    talents,
    projectGroups,
    matchCount,
    proposalGroups,
    aiToday,
    aiMonth,
    sendersAll,
    sendersToday,
    partnerCompanies,
    ngCompanies,
    aiDaily,
    ingestToday,
    matchCreatedToday,
  ] = await Promise.all([
      // All talent lightweight fields
      prisma.talent.findMany({
        where: { orgId },
        select: {
          status: true,
          talentType: true,
          skills: true,
          remotePreference: true,
          assignee: { select: { name: true } },
        },
      }),
      // Project counts grouped by status
      prisma.project.groupBy({
        by: ["status"],
        where: { orgId },
        _count: { _all: true },
      }),
      // Total matches (scoped via talent -> org)
      prisma.match.count({
        where: { talent: { orgId } },
      }),
      // Proposal counts grouped by status
      prisma.proposal.groupBy({
        by: ["status"],
        where: { orgId },
        _count: { _all: true },
      }),
      // 今日のAIコスト（タグ別）
      prisma.aiUsage.groupBy({
        by: ["tag"],
        where: { createdAt: { gte: todayStart } },
        _sum: { cost: true },
        _count: { _all: true },
      }),
      // 今月のAIコスト合計
      prisma.aiUsage.aggregate({
        where: { createdAt: { gte: monthStart } },
        _sum: { cost: true },
      }),
      // うち宛にメールを送ってきた送信元（全期間・差出人別の件数）。
      prisma.ingestedEmail.groupBy({
        by: ["fromAddr"],
        where: { orgId },
        _count: { _all: true },
      }),
      // 今日の送信元（差出人別）。
      prisma.ingestedEmail.groupBy({
        by: ["fromAddr"],
        where: { orgId, createdAt: { gte: todayStart } },
        _count: { _all: true },
      }),
      // 表示名引き当て用（提携先会社のドメイン→会社名）。
      prisma.partnerCompany.findMany({
        where: { orgId, domain: { not: null } },
        select: { name: true, domain: true },
      }),
      // NG企業ドメイン（送信元一覧でのNG表示用）。
      prisma.ngCompany.findMany({ where: { orgId }, select: { domain: true } }),
      // 日別のAIコスト（直近30日・JST日付で集計）。
      prisma.$queryRaw<{ day: string; cost: number; calls: number }[]>`
        SELECT to_char("createdAt" AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS day,
               SUM(cost)::float8 AS cost,
               COUNT(*)::int AS calls
        FROM "AiUsage"
        WHERE "createdAt" >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day DESC
      `,
      // 今日取り込んだメールの内訳（種別ごと）。新規＝人材/案件。
      prisma.ingestedEmail.groupBy({
        by: ["kind"],
        where: { orgId, createdAt: { gte: todayStart } },
        _count: { _all: true },
      }),
      // 今日作成されたマッチ件数（マッチ処理が流れた結果）。
      prisma.match.count({
        where: { createdAt: { gte: todayStart }, talent: { orgId } },
      }),
    ]);

  // -- AI cost aggregates --
  const aiTodayCost = aiToday.reduce((s, g) => s + (g._sum.cost ?? 0), 0);
  const aiMonthCost = aiMonth._sum.cost ?? 0;
  const aiTagRows = aiToday
    .map((g) => ({
      label: AI_TAG_LABELS[g.tag] ?? g.tag,
      cost: g._sum.cost ?? 0,
      calls: g._count._all,
    }))
    .sort((a, b) => b.cost - a.cost);

  // -- 今日の取込・マッチ処理 --
  const ingestCount = (k: string) =>
    ingestToday.find((g) => g.kind === k)?._count._all ?? 0;
  const todayTalents = ingestCount("TALENT");
  const todayProjects = ingestCount("PROJECT");
  const todayNew = todayTalents + todayProjects; // 新規（人材＋案件）
  const todayDuplicate = ingestCount("DUPLICATE");
  const todayIgnore = ingestCount("IGNORE");
  const todayError = ingestCount("ERROR");
  const todayMailTotal = todayNew + todayDuplicate + todayIgnore + todayError;
  // マッチ判定の実行回数（LLMバッチ数）。
  const matchRunsToday = aiToday.find((g) => g.tag === "match")?._count._all ?? 0;

  // -- メール送信元の会社集計（差出人ドメイン＝会社で名寄せ） --
  const domainNameMap = new Map<string, string>();
  for (const c of partnerCompanies) {
    const d = (c.domain ?? "").toLowerCase();
    if (d && !domainNameMap.has(d)) domainNameMap.set(d, c.name);
  }
  const ngDomainSet = new Set(ngCompanies.map((n) => n.domain));

  /** 差出人別件数 → 会社ドメイン別件数に集約（フリーメール/不明は会社として数えない）。 */
  function aggregateCompanies(
    rows: { fromAddr: string | null; _count: { _all: number } }[],
  ): { domains: Map<string, number>; nonCompanyEmails: number } {
    const domains = new Map<string, number>();
    let nonCompanyEmails = 0;
    for (const r of rows) {
      const d = companyDomain(r.fromAddr);
      if (!d) {
        nonCompanyEmails += r._count._all;
        continue;
      }
      domains.set(d, (domains.get(d) ?? 0) + r._count._all);
    }
    return { domains, nonCompanyEmails };
  }

  const allAgg = aggregateCompanies(sendersAll);
  const todayAgg = aggregateCompanies(sendersToday);
  const distinctCompanies = allAgg.domains.size;
  const totalCompanyEmails = [...allAgg.domains.values()].reduce((s, n) => s + n, 0);
  const todayCompanies = todayAgg.domains.size;
  const todayCompanyEmails = [...todayAgg.domains.values()].reduce((s, n) => s + n, 0);

  const topSenders = [...allAgg.domains.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([domain, count]) => ({
      domain,
      name: domainNameMap.get(domain) ?? null,
      count,
      isNg: ngDomainSet.has(domain),
    }));

  // -- KPI aggregates --

  const totalTalents = talents.length;
  const inhouse = talents.filter((t) => t.talentType === "INHOUSE").length;
  const partner = talents.filter((t) => t.talentType === "PARTNER").length;

  const toProjectCount = (status: string) =>
    projectGroups.find((g) => g.status === status)?._count._all ?? 0;
  const totalProjects = projectGroups.reduce((s, g) => s + g._count._all, 0);
  const openProjects = toProjectCount("OPEN");

  const totalProposals = proposalGroups.reduce(
    (s, g) => s + g._count._all,
    0,
  );

  // -- Talent status breakdown --

  const talentStatusColors: Record<string, string> = {
    NONE: "bg-slate-300",
    PROPOSING: "bg-amber-400",
    ACTIVE: "bg-emerald-500",
    CLOSED: "bg-slate-400",
  };
  const talentStatusSegments = Object.entries(TALENT_STATUS_LABELS).map(
    ([key, label]) => ({
      label,
      count: talents.filter((t) => t.status === key).length,
      colorClass: talentStatusColors[key] ?? "bg-slate-300",
    }),
  );

  // -- Project status breakdown --

  const projectStatusColors: Record<string, string> = {
    OPEN: "bg-blue-500",
    PROPOSING: "bg-amber-400",
    DECIDED: "bg-indigo-500",
    CLOSED: "bg-slate-400",
  };
  const projectStatusSegments = Object.entries(PROJECT_STATUS_LABELS).map(
    ([key, label]) => ({
      label,
      count: toProjectCount(key),
      colorClass: projectStatusColors[key] ?? "bg-slate-300",
    }),
  );

  // -- Proposal status breakdown --

  const proposalStatusColors: Record<string, string> = {
    DRAFT: "bg-slate-300",
    SENT: "bg-blue-400",
    ACCEPTED: "bg-emerald-500",
    REJECTED: "bg-red-400",
  };
  const proposalStatusLabels: Record<string, string> = {
    DRAFT: "下書き",
    SENT: "送信済み",
    ACCEPTED: "受諾",
    REJECTED: "見送り",
  };
  const proposalStatusSegments = Object.entries(proposalStatusLabels).map(
    ([key, label]) => ({
      label,
      count: proposalGroups.find((g) => g.status === key)?._count._all ?? 0,
      colorClass: proposalStatusColors[key] ?? "bg-slate-300",
    }),
  );

  // -- Skill Top 10 --

  const skillMap = new Map<string, number>();
  for (const t of talents) {
    for (const skill of t.skills) {
      const s = skill.trim();
      if (s) skillMap.set(s, (skillMap.get(s) ?? 0) + 1);
    }
  }
  const top10Skills = [...skillMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, count]) => ({ label, count }));
  const maxSkillCount = top10Skills[0]?.count ?? 0;

  // -- Remote preference distribution --

  const remoteMap = new Map<string, number>();
  for (const t of talents) {
    if (t.remotePreference) {
      remoteMap.set(
        t.remotePreference,
        (remoteMap.get(t.remotePreference) ?? 0) + 1,
      );
    }
  }
  const remoteItems = Object.entries(REMOTE_LABELS)
    .map(([key, label]) => ({ label, count: remoteMap.get(key) ?? 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
  const maxRemoteCount = remoteItems[0]?.count ?? 0;

  // -- Assignee talent counts --

  const assigneeMap = new Map<string, number>();
  for (const t of talents) {
    const name = t.assignee?.name ?? "未担当";
    assigneeMap.set(name, (assigneeMap.get(name) ?? 0) + 1);
  }
  const assigneeItems = [...assigneeMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));
  const maxAssigneeCount = assigneeItems[0]?.count ?? 0;

  return (
    <div className="flex flex-col gap-6 p-6 min-h-full">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">レポート</h1>
        <span className="text-xs text-muted">{org.name}</span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="人材総数" value={totalTalents} />
        <StatCard
          label="自社 / 他社"
          value={`${inhouse} / ${partner}`}
          sub="自社保有 / 協力会社"
        />
        <StatCard
          label="案件総数"
          value={totalProjects}
          sub={`うち募集中 ${openProjects} 件`}
        />
        <StatCard label="マッチ件数" value={matchCount} />
        <StatCard label="提案件数" value={totalProposals} />
        <StatCard
          label="今日のAIコスト"
          value={`${fmtUsd(aiTodayCost)}（${fmtYen(aiTodayCost)}）`}
          sub={`今月累計 ${fmtUsd(aiMonthCost)}（${fmtYen(aiMonthCost)}）`}
        />
      </div>

      {/* 今日の処理（取込・マッチ） */}
      <Section title="今日の処理（取込・マッチ）">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <div className="text-3xl font-bold leading-none text-foreground">{todayNew}</div>
            <div className="mt-1 text-xs text-muted">
              今日の新規（人材 {todayTalents}・案件 {todayProjects}）
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold leading-none text-foreground">{matchCreatedToday}</div>
            <div className="mt-1 text-xs text-muted">
              今日作成されたマッチ（判定実行 {matchRunsToday}回）
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold leading-none text-foreground">{todayMailTotal}</div>
            <div className="mt-1 text-xs text-muted">今日取り込んだメール総数</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>新規人材 <b className="text-slate-800">{todayTalents}</b></span>
          <span>新規案件 <b className="text-slate-800">{todayProjects}</b></span>
          <span>重複/再送 <b className="text-slate-700">{todayDuplicate}</b></span>
          <span>対象外 <b className="text-slate-700">{todayIgnore}</b></span>
          <span>
            エラー <b className={todayError > 0 ? "text-red-600" : "text-slate-700"}>{todayError}</b>
          </span>
        </div>
        <p className="text-xs text-muted">
          ※ 「今日取り込んだ」は取込処理が走った時刻基準。新規＝人材・案件として登録された件数。
        </p>
      </Section>

      {/* 今日のAIコスト内訳（暴騰の早期検知用） */}
      {aiTagRows.length > 0 && (
        <Section title="今日のAIコスト内訳">
          <div className="flex flex-col gap-2">
            {aiTagRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{r.label}</span>
                <span className="text-muted">
                  {r.calls}回 / <span className="font-medium text-slate-800">{fmtUsd(r.cost, 3)}（{fmtYen(r.cost)}）</span>
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 日別AIコスト（直近30日・1日ずつ） */}
      {aiDaily.length > 0 && (
        <Section title="日別AIコスト（直近30日）">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-slate-500">
                  <th className="px-3 py-2 text-left font-medium">日付</th>
                  <th className="px-3 py-2 text-right font-medium">回数</th>
                  <th className="px-3 py-2 text-right font-medium">コスト(USD)</th>
                  <th className="px-3 py-2 text-right font-medium">コスト(円)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {aiDaily.map((d) => (
                  <tr key={d.day} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{fmtDay(d.day)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{d.calls.toLocaleString("ja-JP")}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtUsd(d.cost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{fmtYen(d.cost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-slate-50 text-sm font-medium">
                  <td className="px-3 py-2 text-slate-700">合計（30日）</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {aiDaily.reduce((s, d) => s + d.calls, 0).toLocaleString("ja-JP")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {fmtUsd(aiDaily.reduce((s, d) => s + d.cost, 0))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                    {fmtYen(aiDaily.reduce((s, d) => s + d.cost, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-muted">円換算レート: $1 = ¥{USD_JPY}（環境変数 USD_JPY_RATE で変更可）</p>
        </Section>
      )}

      {/* メール送信元の会社 */}
      <Section title="メール送信元の会社">
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <div className="text-3xl font-bold leading-none text-foreground">{distinctCompanies}</div>
            <div className="mt-1 text-xs text-muted">送信元の会社数（全期間・累計 {totalCompanyEmails}通）</div>
          </div>
          <div>
            <div className="text-3xl font-bold leading-none text-foreground">{todayCompanies}</div>
            <div className="mt-1 text-xs text-muted">今日メールがあった会社数（{todayCompanyEmails}通）</div>
          </div>
        </div>
        <div className="mt-2">
          <div className="mb-2 text-xs font-medium text-slate-500">メールが多い送信元 Top15（ドメイン＝会社で名寄せ）</div>
          {topSenders.length === 0 ? (
            <p className="py-2 text-sm text-muted">データなし</p>
          ) : (
            <ul className="divide-y divide-border">
              {topSenders.map((s) => (
                <li key={s.domain} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-slate-800">{s.name || s.domain}</span>
                    {s.name && <span className="ml-2 font-mono text-xs text-slate-500">{s.domain}</span>}
                    {s.isNg && (
                      <span className="ml-2 inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">
                        NG
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums font-semibold text-slate-700">{s.count}通</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">
            ※ 差出人メールのドメインで会社を識別（フリーメールは会社数に含めません）。
          </p>
        </div>
      </Section>

      {/* Status breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Section title="人材ステータス内訳">
          <SegmentBar segments={talentStatusSegments} />
        </Section>
        <Section title="案件ステータス内訳">
          <SegmentBar segments={projectStatusSegments} />
        </Section>
        <Section title="提案ステータス内訳">
          <SegmentBar segments={proposalStatusSegments} />
        </Section>
      </div>

      {/* Skill / Remote / Assignee bars */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Section title="スキル別人材数 Top10">
          <LabeledBars
            items={top10Skills}
            max={maxSkillCount}
            colorClass="bg-primary"
          />
        </Section>

        <Section title="リモート希望の分布">
          <LabeledBars
            items={remoteItems}
            max={maxRemoteCount}
            colorClass="bg-indigo-500"
          />
        </Section>

        <Section title="担当者別 人材数">
          <LabeledBars
            items={assigneeItems}
            max={maxAssigneeCount}
            colorClass="bg-emerald-500"
          />
        </Section>
      </div>
    </div>
  );
}
