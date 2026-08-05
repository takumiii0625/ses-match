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
/** 年月 YYYY-MM → 「YYYY年M月」。 */
function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}
/** Date → JSTの年月キー YYYY-MM。 */
function jstMonthKey(d: Date): string {
  const j = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}`;
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
    partnerCompanies,
    ngCompanies,
    aiDaily,
    ingestToday,
    matchCreatedToday,
    partnerContactEmails,
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
      // 今日のAIコスト（タグ別）。items はマッチ判定でLLMにかけた候補人数（延べ）。
      prisma.aiUsage.groupBy({
        by: ["tag"],
        where: { createdAt: { gte: todayStart } },
        _sum: { cost: true, items: true },
        _count: { _all: true },
      }),
      // 今月のAIコスト合計
      prisma.aiUsage.aggregate({
        where: { createdAt: { gte: monthStart } },
        _sum: { cost: true },
      }),
      // うち宛にメールを送ってきた送信元（全期間・差出人別の件数＋初回受信日）。
      // _min.createdAt は「その会社が初めてメールを送ってきた月」の月別集計に使う。
      prisma.ingestedEmail.groupBy({
        by: ["fromAddr"],
        where: { orgId },
        _count: { _all: true },
        _min: { createdAt: true },
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
      // 既存配信先のメール（ドメイン照合用）。送信元が配信先に登録済みかの判定に使う。
      prisma.partnerContact.findMany({
        where: { orgId },
        select: { email: true },
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
  // マッチ判定の実行回数（LLMバッチ数）と、LLMにかけた候補人数（延べ・バッチ人数の合計）。
  // マッチ判定は候補5人ごとのバッチでLLMを呼ぶため、回数=バッチ数、人数=延べ候補数。
  const matchAgg = aiToday.find((g) => g.tag === "match");
  const matchRunsToday = matchAgg?._count._all ?? 0;
  const matchItemsToday = matchAgg?._sum.items ?? 0;

  // -- マッチ実行ステータス（「動いて0件」「対象0件で空振り」「未稼働」を判別） --
  // 判定対象は「today の新規案件」。matchRunsToday は今日の LLM 判定回数（=実際に
  // 判定が走ったか）、matchCreatedToday は成立件数。todayProjects は今日の新規案件数。
  // ・判定>0・成立>0 → 正常稼働
  // ・判定>0・成立0  → 動いたが条件に合う候補なし（正常）
  // ・判定0・新規案件>0 → ★異常: 新規案件があるのに判定されていない（窓/receivedDate問題等）
  // ・判定0・新規案件0 → 本日の判定対象なし（週末等。異常ではない）
  const matchStatus: { tone: "ok" | "info" | "warn"; label: string; detail: string } =
    matchRunsToday > 0
      ? matchCreatedToday > 0
        ? {
            tone: "ok",
            label: `稼働中・成立 ${matchCreatedToday}件`,
            detail: `今日 延べ ${matchItemsToday.toLocaleString("ja-JP")}人の候補をLLM判定し（${matchRunsToday}バッチ）、${matchCreatedToday}件のマッチが成立しました。`,
          }
        : {
            tone: "info",
            label: "稼働中・成立0件",
            detail: `今日 延べ ${matchItemsToday.toLocaleString("ja-JP")}人の候補をLLM判定しましたが（${matchRunsToday}バッチ）、条件に合う候補が無くマッチは0件でした（処理自体は正常）。`,
          }
      : todayProjects > 0
        ? {
            tone: "warn",
            label: `判定待ち・判定0回（新規案件 ${todayProjects}件）`,
            detail: `今日 ${todayProjects}件の案件を新規取込しましたが、マッチ判定はまだ実行されていません。マッチは取込(fetch-mail)の完了後に自動起動する設計のため、取込が進行中なら完了後に判定されます。取込完了後もしばらく0のままなら、定時ジョブ rematch-daily（取込完了トリガ）のログを確認してください。`,
          }
        : {
            tone: "info",
            label: "本日の判定対象なし",
            detail: "今日は新規案件の取込が無く、マッチ判定の対象がありませんでした（週末などでは正常）。",
          };

  // NG企業ドメイン（未登録送信元一覧でのNG表示用）。
  const ngDomainSet = new Set(ngCompanies.map((n) => n.domain));

  // -- 未登録の送信元会社（受信メールの差出人ドメインのうち、配信先に未登録のもの） --
  // 配信先に「登録済み」とみなすドメイン集合を作る:
  //  ・提携先会社の domain 列
  //  ・既存配信先(連絡先)メールから導出したドメイン（会社にdomainが無い分を補う）
  const registeredDomains = new Set<string>();
  for (const c of partnerCompanies) {
    const d = (c.domain ?? "").toLowerCase();
    if (d) registeredDomains.add(d);
  }
  for (const e of partnerContactEmails) {
    const d = companyDomain(e.email);
    if (d) registeredDomains.add(d);
  }
  // 差出人を件数の多い順に見て、ドメイン単位で「未登録」だけ集約（代表アドレスは最多の差出人）。
  const sendersSorted = [...sendersAll].sort((a, b) => b._count._all - a._count._all);
  const unregMap = new Map<string, { count: number; sample: string }>();
  for (const r of sendersSorted) {
    const d = companyDomain(r.fromAddr);
    if (!d || registeredDomains.has(d)) continue; // 会社ドメインでない/登録済みは除外
    const cur = unregMap.get(d);
    if (cur) cur.count += r._count._all;
    else unregMap.set(d, { count: r._count._all, sample: r.fromAddr ?? d });
  }
  const unregisteredSenders = [...unregMap.entries()]
    .map(([domain, v]) => ({
      domain,
      sample: v.sample,
      count: v.count,
      isNg: ngDomainSet.has(domain),
    }))
    .sort((a, b) => b.count - a.count);
  const unregisteredCount = unregisteredSenders.length;
  const unregisteredEmails = unregisteredSenders.reduce((s, x) => s + x.count, 0);
  const topUnregistered = unregisteredSenders.slice(0, 30);

  // JSTの当月キー（当月行のハイライト・当月の新規数に使う）。当月は途中でも必ず表示する。
  const jstNowForMonth = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const currentMonthKey = `${jstNowForMonth.getUTCFullYear()}-${String(
    jstNowForMonth.getUTCMonth() + 1,
  ).padStart(2, "0")}`;

  // -- 送信元会社の増加（月別）：受信メールの差出人を「初めて受信した月」で集計 --
  // 各会社ドメインの初回受信日(_min.createdAt)を求め、そのJST月を「初出月」とする。
  // 配信先(CSV)は静的でも、案件/人材メールを送ってくる会社は毎月増えるため、その実勢を月別に見せる。
  const firstSeenByDomain = new Map<string, Date>();
  for (const r of sendersAll) {
    const d = companyDomain(r.fromAddr);
    if (!d) continue; // フリーメール/不明は会社として数えない
    const t = r._min?.createdAt;
    if (!t) continue;
    const cur = firstSeenByDomain.get(d);
    if (!cur || t < cur) firstSeenByDomain.set(d, t);
  }
  // 初出月ごとに「新規送信元会社」と「うち未登録（＝配信先候補）」を数える。
  const senderMonthMap = new Map<string, { total: number; unregistered: number }>();
  for (const [domain, first] of firstSeenByDomain) {
    const m = jstMonthKey(first);
    const e = senderMonthMap.get(m) ?? { total: 0, unregistered: 0 };
    e.total++;
    if (!registeredDomains.has(domain)) e.unregistered++;
    senderMonthMap.set(m, e);
  }
  // 当月は途中でも必ず表示。古い順に累計を積み、表示は新しい順。
  const senderMonthKeys = [
    ...new Set([...senderMonthMap.keys(), currentMonthKey]),
  ].sort();
  let cumulativeSenders = 0;
  const senderGrowthAsc = senderMonthKeys.map((month) => {
    const e = senderMonthMap.get(month);
    const total = e?.total ?? 0;
    cumulativeSenders += total;
    return {
      month,
      total,
      unregistered: e?.unregistered ?? 0,
      cumulative: cumulativeSenders,
    };
  });
  const senderGrowth = [...senderGrowthAsc].reverse();
  const newSendersThisMonth =
    senderGrowth.find((r) => r.month === currentMonthKey)?.total ?? 0;
  // 送信元会社の累計（これまでにメールをくれた会社数）と、うち未登録（配信先候補）。
  const totalSenderCompanies = firstSeenByDomain.size;

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
        <div
          className={
            "rounded-md border px-3 py-2 " +
            (matchStatus.tone === "ok"
              ? "border-emerald-200 bg-emerald-50"
              : matchStatus.tone === "info"
                ? "border-blue-200 bg-blue-50"
                : "border-red-200 bg-red-50")
          }
        >
          <div className="flex items-center gap-2">
            <span
              className={
                "inline-block h-2.5 w-2.5 rounded-full " +
                (matchStatus.tone === "ok"
                  ? "bg-emerald-500"
                  : matchStatus.tone === "info"
                    ? "bg-blue-500"
                    : "bg-red-500")
              }
            />
            <span
              className={
                "text-sm font-semibold " +
                (matchStatus.tone === "ok"
                  ? "text-emerald-800"
                  : matchStatus.tone === "info"
                    ? "text-blue-800"
                    : "text-red-800")
              }
            >
              マッチ実行ステータス：{matchStatus.label}
            </span>
          </div>
          <p
            className={
              "mt-1 text-xs " +
              (matchStatus.tone === "ok"
                ? "text-emerald-700"
                : matchStatus.tone === "info"
                  ? "text-blue-700"
                  : "text-red-700")
            }
          >
            {matchStatus.detail}
          </p>
        </div>
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
              今日成立したマッチ／LLM判定 延べ {matchItemsToday.toLocaleString("ja-JP")}人（候補5人ごとに判定・{matchRunsToday}バッチ）
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

      {/* 未登録の送信元会社（配信先の候補） */}
      <Section title="未登録の送信元会社（配信先の候補）">
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <div className="text-3xl font-bold leading-none text-foreground">
              {unregisteredCount.toLocaleString("ja-JP")}
            </div>
            <div className="mt-1 text-xs text-muted">
              配信先に未登録の送信元会社数
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold leading-none text-foreground">
              {unregisteredEmails.toLocaleString("ja-JP")}
            </div>
            <div className="mt-1 text-xs text-muted">その会社から届いたメール総数</div>
          </div>
        </div>
        {topUnregistered.length === 0 ? (
          <p className="py-2 text-sm text-muted">
            未登録の送信元会社はありません（受信のある会社はすべて配信先に登録済みです）。
          </p>
        ) : (
          <div>
            <div className="mb-2 text-xs font-medium text-slate-500">
              メールが多い未登録会社 Top30（ドメイン＝会社で名寄せ）
            </div>
            <ul className="divide-y divide-border">
              {topUnregistered.map((s) => (
                <li key={s.domain} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-slate-800">{s.domain}</span>
                    <span className="ml-2 font-mono text-xs text-slate-500">{s.sample}</span>
                    {s.isNg && (
                      <span className="ml-2 inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">
                        NG
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums font-semibold text-slate-700">
                    {s.count.toLocaleString("ja-JP")}通
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">
          ※ 案件/人材メールを送ってきた差出人のうち、まだ「提携先会社（配信先）」に登録していない会社です。
          一斉案内を送りたい相手はここから拾って、提携先会社に追加してください（フリーメール・NGは対象外／NGは印付き）。
        </p>
      </Section>

      {/* 送信元会社の増加（受信ベース・月別） */}
      <Section title="送信元会社の増加">
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <div className="text-3xl font-bold leading-none text-foreground">
              {totalSenderCompanies.toLocaleString("ja-JP")}
            </div>
            <div className="mt-1 text-xs text-muted">送信元会社 総数（累計）</div>
          </div>
          <div>
            <div className="text-3xl font-bold leading-none text-amber-600">
              {unregisteredCount.toLocaleString("ja-JP")}
            </div>
            <div className="mt-1 text-xs text-muted">うち未登録（配信先候補）</div>
          </div>
          <div>
            <div className="text-3xl font-bold leading-none text-foreground">
              +{newSendersThisMonth.toLocaleString("ja-JP")}
            </div>
            <div className="mt-1 text-xs text-muted">今月 初めてメールが来た会社</div>
          </div>
        </div>

        <div className="text-xs font-medium text-slate-500">
          送信元会社の増加（初めて受信した月で集計）
        </div>
        {senderGrowth.length === 0 ? (
          <p className="py-2 text-sm text-muted">データなし</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-slate-500">
                  <th className="px-3 py-2 text-left font-medium">月</th>
                  <th className="px-3 py-2 text-right font-medium">新規送信元会社</th>
                  <th className="px-3 py-2 text-right font-medium">うち未登録（配信先候補）</th>
                  <th className="px-3 py-2 text-right font-medium">累計送信元会社</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {senderGrowth.map((r) => {
                  const isCurrent = r.month === currentMonthKey;
                  return (
                    <tr
                      key={r.month}
                      className={isCurrent ? "bg-emerald-50" : "hover:bg-slate-50"}
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                        {fmtMonth(r.month)}
                        {isCurrent && (
                          <span className="ml-2 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                            今月・途中経過
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">
                        +{r.total.toLocaleString("ja-JP")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                        +{r.unregistered.toLocaleString("ja-JP")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {r.cumulative.toLocaleString("ja-JP")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted">
          ※ 案件・人材メールを送ってくる会社を、差出人メールのドメイン＝会社で名寄せ。「初めて受信した月」で
          新規計上（フリーメールは対象外）。「うち未登録」は現時点で提携先会社（配信先）に未登録の会社数＝
          一斉案内に追加できる候補。当月は月途中でも表示します（途中経過）。
        </p>
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
