import { getCurrentOrg, getOrgUsers } from "@/lib/current-org";
import { prisma } from "@/lib/prisma";
import {
  parseProjectFilters,
  buildProjectWhere,
  buildProjectOrderBy,
} from "@/lib/data/project";
import { ProjectSearch } from "./project-search";
import { ProjectTable } from "./project-table";

export default async function ProjectsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const org = await getCurrentOrg();
  const users = await getOrgUsers(org.id);

  const filters = parseProjectFilters(sp);

  const projects = await prisma.project.findMany({
    where: buildProjectWhere(org.id, filters),
    orderBy: buildProjectOrderBy(filters),
    include: {
      assignee: true,
      _count: { select: { matches: true } },
    },
  });

  return (
    <div className="flex flex-col gap-4 p-6 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">案件</h1>
      </div>
      <ProjectSearch users={users} />
      <ProjectTable projects={projects} total={projects.length} />
    </div>
  );
}
