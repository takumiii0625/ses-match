import { getCurrentOrg, getOrgUsers } from "@/lib/current-org";
import { prisma } from "@/lib/prisma";
import { parseTalentFilters, buildTalentWhere, buildTalentOrderBy } from "@/lib/data/talent";
import { SearchPanel } from "./search-panel";
import { TalentTable } from "./talent-table";

export default async function InHouseTalentPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const org = await getCurrentOrg();
  const users = await getOrgUsers(org.id);

  const filters = parseTalentFilters(sp);

  const talents = await prisma.talent.findMany({
    where: buildTalentWhere(org.id, filters),
    orderBy: buildTalentOrderBy(filters),
    include: {
      assignee: true,
      attachments: true,
    },
  });

  return (
    <div className="flex flex-col gap-4 p-6 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">自社保有人材</h1>
      </div>
      <SearchPanel users={users} />
      <TalentTable talents={talents} total={talents.length} />
    </div>
  );
}
