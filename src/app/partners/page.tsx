import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { parsePartnerFilters, buildPartnerWhere, buildPartnerOrderBy } from "@/lib/data/partner";
import { PartnerList, type PartnerRow } from "./partner-list";

export const metadata = { title: "提携先会社 — SES Match" };
export const dynamic = "force-dynamic";

export default async function PartnersPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const org = await getCurrentOrg();
  const filters = parsePartnerFilters(sp);

  const companies = await prisma.partnerCompany.findMany({
    where: buildPartnerWhere(org.id, filters),
    orderBy: buildPartnerOrderBy(filters),
    include: {
      contacts: { select: { status: true } },
    },
    take: 2000,
  });

  const rows: PartnerRow[] = companies.map((c) => {
    const active = c.contacts.filter((x) => x.status === "ACTIVE").length;
    const bounced = c.contacts.filter((x) => x.status === "BOUNCED").length;
    const unsub = c.contacts.filter((x) => x.status === "UNSUBSCRIBED").length;
    return {
      id: c.id,
      name: c.name,
      industry: c.industry,
      domain: c.domain,
      tags: c.tags,
      contactCount: c.contacts.length,
      activeCount: active,
      bouncedCount: bounced,
      unsubCount: unsub,
    };
  });

  // 全体KPI（フィルタ前の総数）。
  const [companyTotal, contactAgg] = await Promise.all([
    prisma.partnerCompany.count({ where: { orgId: org.id } }),
    prisma.partnerContact.groupBy({
      by: ["status"],
      where: { orgId: org.id },
      _count: { _all: true },
    }),
  ]);
  const statusCount = (s: string) =>
    contactAgg.find((g) => g.status === s)?._count._all ?? 0;
  const stats = {
    companies: companyTotal,
    active: statusCount("ACTIVE"),
    bounced: statusCount("BOUNCED"),
    unsub: statusCount("UNSUBSCRIBED"),
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 min-h-full">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">提携先会社</h1>
          <p className="mt-1 text-sm text-muted">
            協力会社の連絡先を管理し、自社人材の一斉案内メールの送信先にします。
          </p>
        </div>
      </div>
      <PartnerList rows={rows} stats={stats} initialQuery={filters.query ?? ""} initialStatus={filters.status ?? ""} />
    </div>
  );
}
