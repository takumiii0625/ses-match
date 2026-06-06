import { getCurrentOrg, getOrgUsers } from "@/lib/current-org";
import { getCurrentUser } from "@/lib/data/current-user";
import { prisma } from "@/lib/prisma";
import { parseTalentFilters, buildTalentWhere, buildTalentOrderBy } from "@/lib/data/talent";
import { SearchPanel } from "./search-panel";
import { TalentTable } from "./talent-table";

export default async function InHouseTalentPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const org = await getCurrentOrg();
  const [users, currentUser] = await Promise.all([
    getOrgUsers(org.id),
    getCurrentUser(),
  ]);

  const filters = parseTalentFilters(sp);

  const [talents, favRecords] = await Promise.all([
    prisma.talent.findMany({
      where: buildTalentWhere(org.id, filters),
      orderBy: buildTalentOrderBy(filters),
      include: {
        assignee: true,
        attachments: true,
      },
    }),
    prisma.favorite.findMany({
      where: { userId: currentUser.id, talentId: { not: null } },
      select: { talentId: true },
    }),
  ]);

  const favoriteTalentIds = new Set(
    favRecords.map((f) => f.talentId as string),
  );

  return (
    <div className="flex flex-col gap-4 p-6 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">自社保有人材</h1>
      </div>
      <SearchPanel users={users} />
      <TalentTable talents={talents} total={talents.length} favoriteTalentIds={favoriteTalentIds} />
    </div>
  );
}
