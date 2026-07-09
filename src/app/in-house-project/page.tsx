import { getCurrentOrg, getOrgUsers } from "@/lib/current-org";
import { getCurrentUser } from "@/lib/data/current-user";
import { prisma } from "@/lib/prisma";
import {
  parseProjectFilters,
  buildProjectWhere,
  buildProjectOrderBy,
} from "@/lib/data/project";
import { ProjectSearch } from "../projects/project-search";
import { ProjectTable } from "../projects/project-table";

export const metadata = { title: "自社保有案件 — Caduceus" };

export default async function InHouseProjectPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const org = await getCurrentOrg();
  const [users, currentUser] = await Promise.all([
    getOrgUsers(org.id),
    getCurrentUser(),
  ]);

  const filters = parseProjectFilters(sp);
  filters.dataFrom = "REGISTER"; // 自社保有案件（自分たちで登録した案件）のみ。

  const [projects, favRecords] = await Promise.all([
    prisma.project.findMany({
      where: buildProjectWhere(org.id, filters),
      orderBy: buildProjectOrderBy(filters),
      include: {
        assignee: true,
        _count: { select: { matches: true } },
      },
    }),
    prisma.favorite.findMany({
      where: { userId: currentUser.id, projectId: { not: null } },
      select: { projectId: true },
    }),
  ]);

  const favoriteProjectIds = new Set(
    favRecords.map((f) => f.projectId as string),
  );

  return (
    <div className="flex flex-col gap-4 p-6 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">自社保有案件</h1>
      </div>
      <p className="text-sm text-muted">
        自分たちで登録した案件（自社保有案件）の一覧です。「＋新規案件登録」から追加できます。
        追加した案件は「自社保有案件マッチ（手動）」で人材とマッチできます。
      </p>
      <ProjectSearch users={users} />
      <ProjectTable
        projects={projects}
        total={projects.length}
        favoriteProjectIds={favoriteProjectIds}
      />
    </div>
  );
}
