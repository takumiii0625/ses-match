import { getCurrentOrg } from "@/lib/current-org";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
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

export default async function ReportsPage() {
  const org = await getCurrentOrg();
  const orgId = org.id;

  // Run all independent queries in parallel
  const [talents, projectGroups, matchCount, proposalGroups] =
    await Promise.all([
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
    ]);

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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
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
      </div>

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
