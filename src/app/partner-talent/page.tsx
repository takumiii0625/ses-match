import { getCurrentOrg, getOrgUsers } from "@/lib/current-org";
import { prisma } from "@/lib/prisma";
import { parseTalentFilters, buildTalentWhere, buildTalentOrderBy } from "@/lib/data/talent";
import { PartnerSearchPanel } from "./partner-search";
import { PartnerTable } from "./partner-table";

export default async function PartnerTalentPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const org = await getCurrentOrg();
  const users = await getOrgUsers(org.id);

  const filters = parseTalentFilters(sp);
  // Force this page to only show PARTNER talent regardless of any query param.
  filters.talentType = "PARTNER";

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
        <h1 className="text-xl font-bold text-slate-800">他社人材</h1>
      </div>
      <PartnerSearchPanel users={users} />
      <PartnerTable talents={talents} total={talents.length} />
    </div>
  );
}
