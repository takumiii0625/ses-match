import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { SentList, type SentRow } from "./sent-list";

export const metadata = { title: "送信履歴 — Hermes" };
export const dynamic = "force-dynamic";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
function startOfTodayJst(): Date {
  const jst = new Date(Date.now() + JST_OFFSET_MS);
  jst.setUTCHours(0, 0, 0, 0);
  return new Date(jst.getTime() - JST_OFFSET_MS);
}

export default async function SentEmailsPage() {
  const org = await getCurrentOrg();

  // 直近500件の送信記録（自動・手動の両方）。
  const sent = await prisma.sentEmail.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  // 人材名・案件名を一括取得して紐付け（SentEmailにリレーションは張っていないため）。
  const talentIds = [...new Set(sent.map((s) => s.talentId))];
  const projectIds = [...new Set(sent.map((s) => s.projectId))];
  const [talents, projects] = await Promise.all([
    prisma.talent.findMany({
      where: { id: { in: talentIds } },
      select: { id: true, name: true },
    }),
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, title: true },
    }),
  ]);
  const talentName = new Map(talents.map((t) => [t.id, t.name]));
  const projectTitle = new Map(projects.map((p) => [p.id, p.title]));

  const rows: SentRow[] = sent.map((s) => ({
    id: s.id,
    createdAt: s.createdAt.toISOString(),
    kind: s.kind,
    status: s.status,
    toAddr: s.toAddr,
    subject: s.subject,
    body: s.body,
    error: s.error,
    talentId: s.talentId,
    projectId: s.projectId,
    talentName: talentName.get(s.talentId) ?? null,
    projectTitle: projectTitle.get(s.projectId) ?? null,
  }));

  // 集計（KPI）。
  const todayStart = startOfTodayJst().getTime();
  const todayRows = rows.filter((r) => Date.parse(r.createdAt) >= todayStart);
  const stats = {
    total: rows.length,
    todaySent: todayRows.filter((r) => r.status === "SENT").length,
    todayFailed: todayRows.filter((r) => r.status === "FAILED").length,
    failedTotal: rows.filter((r) => r.status === "FAILED").length,
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 min-h-full">
      <div>
        <h1 className="text-xl font-bold text-slate-800">送信履歴</h1>
        <p className="mt-1 text-sm text-muted">
          自動送信・手動送信したメールの記録です（最新500件）。失敗は理由も表示します。
        </p>
      </div>
      <SentList rows={rows} stats={stats} />
    </div>
  );
}
