import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { NgCompaniesView, type NgCompanyVM } from "./ng-companies-view";

export const metadata = { title: "NG企業 — Kerykeion" };
export const dynamic = "force-dynamic";

export default async function NgCompaniesPage() {
  const org = await getCurrentOrg();
  const rows = await prisma.ngCompany.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
  });
  const items: NgCompanyVM[] = rows.map((r) => ({
    id: r.id,
    domain: r.domain,
    name: r.name,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">NG企業</h1>
        <p className="mt-1 text-sm text-muted">
          取引NG（出禁）の会社をドメインで登録します。登録した会社の他社人材・案件はマッチング対象から除外されます。
          ただし<span className="font-medium text-slate-700">自社保有人材の提案はNG企業でもマッチ対象に含めます</span>。
        </p>
      </div>
      <NgCompaniesView initial={items} />
    </div>
  );
}
