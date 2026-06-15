import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { BlastView, type BlastTalent, type CampaignRow } from "./blast-view";

export const metadata = { title: "一斉案内 — SES Match" };
export const dynamic = "force-dynamic";

export default async function BlastPage() {
  const org = await getCurrentOrg();

  const [talents, activeCount, campaigns] = await Promise.all([
    prisma.talent.findMany({
      where: { orgId: org.id, talentType: "INHOUSE" },
      orderBy: [{ receivedDate: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        distributionSubject: true,
        mainSkills: true,
        skills: true,
        desiredRateMin: true,
        desiredRateMax: true,
        availabilityText: true,
      },
      take: 500,
    }),
    prisma.partnerContact.count({ where: { orgId: org.id, status: "ACTIVE" } }),
    prisma.blastCampaign.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        subject: true,
        status: true,
        totalCount: true,
        sentCount: true,
        failedCount: true,
        createdAt: true,
      },
    }),
  ]);

  const talentVMs: BlastTalent[] = talents.map((t) => ({
    id: t.id,
    name: t.name,
    distributionSubject: t.distributionSubject,
    skills: (t.mainSkills.length ? t.mainSkills : t.skills).slice(0, 6),
    rate:
      t.desiredRateMin || t.desiredRateMax
        ? `${t.desiredRateMin ?? "-"}〜${t.desiredRateMax ?? "-"}万`
        : null,
    availability: t.availabilityText,
  }));
  const campaignRows: CampaignRow[] = campaigns.map((c) => ({
    id: c.id,
    subject: c.subject,
    status: c.status,
    totalCount: c.totalCount,
    sentCount: c.sentCount,
    failedCount: c.failedCount,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 min-h-full">
      <div>
        <Link href="/partners" className="text-xs text-muted hover:text-primary">
          ← 提携先一覧
        </Link>
        <h1 className="mt-1 text-xl font-bold text-slate-800">一斉案内（人材紹介）</h1>
        <p className="mt-1 text-sm text-muted">
          自社保有人材を選び、配信中の提携先（{activeCount}件）へ紹介メールを一斉送信します。
        </p>
      </div>
      <BlastView talents={talentVMs} activeContactCount={activeCount} campaigns={campaignRows} />
    </div>
  );
}
