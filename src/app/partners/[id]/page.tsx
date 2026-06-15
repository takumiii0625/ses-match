import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { Card } from "@/components/ui/card";
import { CompanyDetail, type CompanyVM, type ContactVM } from "./company-detail";

export const dynamic = "force-dynamic";

export default async function PartnerDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const org = await getCurrentOrg();
  const company = await prisma.partnerCompany.findFirst({
    where: { id, orgId: org.id },
    include: { contacts: { orderBy: { createdAt: "asc" } } },
  });
  if (!company) notFound();

  const vm: CompanyVM = {
    id: company.id,
    name: company.name,
    industry: company.industry,
    phone: company.phone,
    website: company.website,
    note: company.note,
    domain: company.domain,
    tags: company.tags,
  };
  const contacts: ContactVM[] = company.contacts.map((c) => ({
    id: c.id,
    email: c.email,
    name: c.name,
    role: c.role,
    status: c.status,
  }));

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 min-h-full max-w-3xl">
      <div>
        <Link href="/partners" className="text-xs text-muted hover:text-primary">
          ← 提携先一覧
        </Link>
        <h1 className="mt-1 text-xl font-bold text-slate-800">{company.name}</h1>
      </div>
      <CompanyDetail company={vm} contacts={contacts} />
      <Card className="p-4 text-xs text-muted">
        この会社の配信中の連絡先は、
        <Link href="/partners/blast" className="text-primary underline">
          一斉案内
        </Link>
        の送信先に含まれます。
      </Card>
    </div>
  );
}
