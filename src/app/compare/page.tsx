import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { CompareView, type TalentVM, type ProjectCardVM } from "./compare-view";

export const metadata = { title: "見比べ — SES Match" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ talentId?: string }>;
}

export default async function ComparePage({ searchParams }: PageProps) {
  const { talentId } = await searchParams;
  const org = await getCurrentOrg();

  // 人材セレクタ用（受信日の新しい順）。
  const talents = await prisma.talent.findMany({
    where: { orgId: org.id },
    orderBy: [{ receivedDate: "desc" }, { createdAt: "desc" }],
    select: { id: true, name: true },
  });

  let talentVM: TalentVM | null = null;
  let projects: ProjectCardVM[] = [];

  if (talentId) {
    const t = await prisma.talent.findFirst({
      where: { id: talentId, orgId: org.id },
    });
    if (t) {
      talentVM = {
        id: t.id,
        name: t.name,
        status: t.status,
        talentType: t.talentType,
        age: t.age,
        gender: t.gender,
        desiredRateMin: t.desiredRateMin,
        desiredRateMax: t.desiredRateMax,
        mainSkills: t.mainSkills,
        skills: t.skills,
        remotePreference: t.remotePreference,
        availabilityText: t.availabilityText,
        nearestStation: t.nearestStation,
        note: t.note,
        emailSubject: t.emailSubject,
        emailBody: t.emailBody,
        emailFrom: t.emailFrom,
        emailTo: t.emailTo,
        sourceEmail: t.sourceEmail,
        receivedDate: t.receivedDate ? t.receivedDate.toISOString() : null,
      };

      // この人材にマッチした案件（スコア順）。
      const matches = await prisma.match.findMany({
        where: { talentId: t.id, project: { orgId: org.id } },
        include: { project: true },
        orderBy: { score: "desc" },
      });
      projects = matches.map((m) => ({
        matchId: m.id,
        score: m.score,
        reasons: m.reasons,
        id: m.project.id,
        title: m.project.title,
        clientName: m.project.clientName,
        status: m.project.status,
        requiredSkills: m.project.requiredSkills,
        rateMin: m.project.rateMin,
        rateMax: m.project.rateMax,
        remotePreference: m.project.remotePreference,
        location: m.project.location,
        startText: m.project.startText,
        receivedDate: m.project.receivedDate
          ? m.project.receivedDate.toISOString()
          : null,
      }));
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">見比べ</h1>
        <p className="mt-1 text-sm text-muted">
          人材と、マッチした案件を左右に並べて見比べられます。
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <CompareView
          talents={talents}
          selectedId={talentId}
          talent={talentVM}
          projects={projects}
        />
      </div>
    </div>
  );
}
