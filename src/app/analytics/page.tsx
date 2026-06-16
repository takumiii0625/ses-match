import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { companyDomain } from "@/lib/matching";
import {
  Section,
  StatCard,
  BarTimeSeries,
  RankList,
  Funnel,
  SegmentBar,
} from "./charts";

export const metadata = { title: "分析 — Kerykeion" };
export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;
const JST = 9 * 60 * 60 * 1000;

/** JST基準の "M/D" キー */
function dayKeyJst(d: Date): string {
  const j = new Date(d.getTime() + JST);
  return `${j.getUTCMonth() + 1}/${j.getUTCDate()}`;
}
/** 直近n日の "M/D" ラベル配列（古い→新しい） */
function lastDaysLabels(n: number): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) out.push(dayKeyJst(new Date(now - i * DAY)));
  return out;
}
/** ISO日時の配列を直近n日の日別カウントに */
function bucketDaily(dates: (Date | string)[], n: number): { label: string; value: number }[] {
  const labels = lastDaysLabels(n);
  const idx = new Map(labels.map((l, i) => [l, i]));
  const counts = new Array(n).fill(0);
  for (const d of dates) {
    const key = dayKeyJst(typeof d === "string" ? new Date(d) : d);
    const i = idx.get(key);
    if (i !== undefined) counts[i]++;
  }
  return labels.map((label, i) => ({ label, value: counts[i] }));
}

/** 文字列配列を出現回数で集計しTop n */
function topCounts(values: string[], n: number): { label: string; value: number }[] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, value]) => ({ label, value }));
}

const N = 30; // 推移の日数

export default async function AnalyticsPage() {
  const org = await getCurrentOrg();
  const orgId = org.id;
  const since = new Date(Date.now() - N * DAY);
  const monthStart = new Date(Date.now() + JST);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartUtc = new Date(monthStart.getTime() - JST);

  const [
    talents,
    projects,
    matches,
    sentEmails,
    proposalGroups,
    partnerCompanies,
    activeContacts,
    matchCount,
  ] = await Promise.all([
    prisma.talent.findMany({
      where: { orgId },
      select: {
        talentType: true,
        status: true,
        skills: true,
        sourceEmail: true,
        receivedDate: true,
        createdAt: true,
      },
    }),
    prisma.project.findMany({
      where: { orgId },
      select: {
        status: true,
        requiredSkills: true,
        sourceEmail: true,
        receivedDate: true,
        createdAt: true,
      },
    }),
    prisma.match.findMany({
      where: { talent: { orgId } },
      select: { score: true, proposable: true, createdAt: true },
    }),
    prisma.sentEmail.findMany({
      where: { orgId },
      select: { kind: true, status: true, createdAt: true, toAddr: true },
    }),
    prisma.proposal.groupBy({ by: ["status"], where: { orgId }, _count: { _all: true } }),
    prisma.partnerCompany.findMany({ where: { orgId }, select: { domain: true, name: true } }),
    prisma.partnerContact.count({ where: { orgId, status: "ACTIVE" } }),
    prisma.match.count({ where: { talent: { orgId } } }),
  ]);

  // ---- KPI ----
  const inhouse = talents.filter((t) => t.talentType === "INHOUSE").length;
  const partner = talents.length - inhouse;
  const openProjects = projects.filter((p) => p.status === "OPEN").length;
  const newTalentsMonth = talents.filter((t) => t.receivedDate >= monthStartUtc).length;
  const newProjectsMonth = projects.filter((p) => p.receivedDate >= monthStartUtc).length;
  const sentMonth = sentEmails.filter((s) => s.createdAt >= monthStartUtc).length;
  const proposable80 = matches.filter((m) => m.score >= 80 && m.proposable).length;

  // ---- 活動の推移（直近N日） ----
  const tsTalent = bucketDaily(talents.map((t) => t.receivedDate), N);
  const tsProject = bucketDaily(projects.map((p) => p.receivedDate), N);
  const tsMatch = bucketDaily(matches.map((m) => m.createdAt), N);
  const tsSent = bucketDaily(sentEmails.map((s) => s.createdAt), N);

  // ---- 営業ファネル ----
  const proposalTotal = proposalGroups.reduce((s, g) => s + g._count._all, 0);
  const proposalAccepted = proposalGroups.find((g) => g.status === "ACCEPTED")?._count._all ?? 0;
  const projectInfoSent = sentEmails.filter((s) => s.kind === "PROJECT_INFO" && s.status === "SENT").length;
  const funnel = [
    { label: "案件", value: projects.length },
    { label: "マッチ(80点+)", value: matches.filter((m) => m.score >= 80).length },
    { label: "案内メール送信", value: projectInfoSent },
    { label: "提案", value: proposalTotal },
    { label: "受諾", value: proposalAccepted },
  ];

  // ---- 会社別ランキング（送信元ドメイン → 提携先名があれば名前） ----
  const domainToName = new Map<string, string>();
  for (const c of partnerCompanies) if (c.domain) domainToName.set(c.domain, c.name);
  const labelOfDomain = (d: string) => domainToName.get(d) ?? d;

  const talentByCompany = topCounts(
    talents
      .filter((t) => t.talentType === "PARTNER")
      .map((t) => companyDomain(t.sourceEmail))
      .filter((d): d is string => !!d)
      .map(labelOfDomain),
    10,
  );
  const projectByCompany = topCounts(
    projects
      .map((p) => companyDomain(p.sourceEmail))
      .filter((d): d is string => !!d)
      .map(labelOfDomain),
    10,
  );

  // ---- マッチ品質 ----
  const scoreBuckets = [
    { label: "80–84", min: 80, max: 84 },
    { label: "85–89", min: 85, max: 89 },
    { label: "90–94", min: 90, max: 94 },
    { label: "95–100", min: 95, max: 100 },
  ];
  const scoreDist = scoreBuckets.map((b) => ({
    label: b.label,
    value: matches.filter((m) => m.score >= b.min && m.score <= b.max).length,
  }));
  const matches80 = matches.filter((m) => m.score >= 80);
  const proposableRate =
    matches80.length > 0
      ? Math.round((matches80.filter((m) => m.proposable).length / matches80.length) * 100)
      : 0;

  // ---- スキル需給ギャップ ----
  const demand = topCounts(
    projects.filter((p) => p.status === "OPEN").flatMap((p) => p.requiredSkills),
    12,
  );
  const supplyMap = new Map<string, number>();
  for (const t of talents)
    if (t.talentType === "INHOUSE") for (const s of t.skills) supplyMap.set(s, (supplyMap.get(s) ?? 0) + 1);
  const gap = demand.map((d) => ({
    label: d.label,
    demand: d.value,
    supply: supplyMap.get(d.label) ?? 0,
  }));

  // ---- メール送信 ----
  const sentByKind = [
    {
      label: "案件案内（人材へ）",
      count: sentEmails.filter((s) => s.kind === "PROJECT_INFO").length,
      colorClass: "bg-blue-500",
    },
    {
      label: "要員提案（案件元へ）",
      count: sentEmails.filter((s) => s.kind === "TALENT_PROPOSAL").length,
      colorClass: "bg-indigo-500",
    },
  ];
  const sentFailed = sentEmails.filter((s) => s.status === "FAILED").length;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 min-h-full">
      <div>
        <h1 className="text-xl font-bold text-slate-800">分析</h1>
        <p className="mt-1 text-sm text-muted">
          人材・案件・マッチ・送信の動きと、営業効率を高めるための切り口をまとめています。
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
        <StatCard label="人材（自社/他社）" value={`${inhouse}/${partner}`} sub="自社保有 / 協力会社" />
        <StatCard label="案件" value={projects.length} sub={`募集中 ${openProjects}`} />
        <StatCard label="マッチ総数" value={matchCount} sub={`提案可(80点+) ${proposable80}`} />
        <StatCard label="提携先会社" value={partnerCompanies.length} sub={`配信中の連絡先 ${activeContacts}`} />
        <StatCard label="今月の新規人材" value={newTalentsMonth} tone="green" />
        <StatCard label="今月の新規案件" value={newProjectsMonth} tone="green" />
        <StatCard label="今月のメール送信" value={sentMonth} tone="indigo" />
        <StatCard label="送信失敗（累計）" value={sentFailed} tone={sentFailed > 0 ? "red" : undefined} />
      </div>

      {/* 活動の推移 */}
      <Section title={`活動の推移（直近${N}日）`} subtitle="日別の流入・マッチ・送信量。営業活動のボリュームを把握できます。">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-sm font-medium text-slate-600">人材の流入</div>
            <BarTimeSeries data={tsTalent} colorClass="bg-emerald-500" unit="件" />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium text-slate-600">案件の流入</div>
            <BarTimeSeries data={tsProject} colorClass="bg-blue-500" unit="件" />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium text-slate-600">マッチ生成</div>
            <BarTimeSeries data={tsMatch} colorClass="bg-amber-500" unit="件" />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium text-slate-600">メール送信</div>
            <BarTimeSeries data={tsSent} colorClass="bg-indigo-500" unit="通" />
          </div>
        </div>
      </Section>

      {/* ファネル */}
      <Section title="営業ファネル（転換率）" subtitle="案件→マッチ→案内→提案→受諾。右の％は前段からの転換率。詰まっている段階が分かります。">
        <Funnel steps={funnel} />
      </Section>

      {/* 会社別ランキング */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="会社別 人材紹介 Top10" subtitle="協力会社（送信元）ごとの紹介人材数。良質な仕入れ先が分かります。">
          <RankList items={talentByCompany} colorClass="bg-emerald-500" />
        </Section>
        <Section title="会社別 案件紹介 Top10" subtitle="送信元ごとの案件数。案件供給の多い取引先が分かります。">
          <RankList items={projectByCompany} colorClass="bg-blue-500" />
        </Section>
      </div>

      {/* マッチ品質 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="マッチのスコア分布" subtitle={`提案可（商流OK）率: ${proposableRate}%（80点以上のうち）`}>
          <RankList
            items={scoreDist.map((s) => ({ label: s.label, value: s.value }))}
            colorClass="bg-amber-500"
          />
        </Section>
        <Section title="メール送信の内訳" subtitle="種別ごとの送信数。">
          <SegmentBar segments={sentByKind} />
        </Section>
      </div>

      {/* スキル需給ギャップ */}
      <Section
        title="スキル需給ギャップ（募集中案件 × 自社人材）"
        subtitle="募集中案件で需要の高いスキルと、自社保有人材の供給数。需要に対し供給が少ないスキルが営業・採用の狙い目です。"
      >
        {gap.length === 0 ? (
          <p className="py-4 text-sm text-muted">募集中案件のスキルデータがありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="py-2 pr-4 font-medium">スキル</th>
                  <th className="py-2 pr-4 font-medium">需要（募集中）</th>
                  <th className="py-2 pr-4 font-medium">供給（自社人材）</th>
                  <th className="py-2 font-medium">充足</th>
                </tr>
              </thead>
              <tbody>
                {gap.map((g) => {
                  const short = g.supply < g.demand;
                  return (
                    <tr key={g.label} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4 font-medium text-slate-800">{g.label}</td>
                      <td className="py-2 pr-4 tabular-nums text-blue-600">{g.demand}</td>
                      <td className="py-2 pr-4 tabular-nums text-emerald-600">{g.supply}</td>
                      <td className="py-2">
                        {short ? (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">
                            供給不足（狙い目）
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                            充足
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
