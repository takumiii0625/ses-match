import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import {
  CompareView,
  type CompareMode,
  type TalentVM,
  type ProjectVM,
  type ProjectCardVM,
  type TalentCardVM,
} from "./compare-view";

export const metadata = { title: "見比べ — SES Match" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ mode?: string; talentId?: string; projectId?: string }>;
}

export default async function ComparePage({ searchParams }: PageProps) {
  const { mode: modeParam, talentId, projectId } = await searchParams;
  const mode: CompareMode = modeParam === "project" ? "project" : "talent";
  const org = await getCurrentOrg();

  let options: { value: string; label: string }[] = [];
  let talentVM: TalentVM | null = null;
  let projectVM: ProjectVM | null = null;
  let rightProjects: ProjectCardVM[] = [];
  let rightTalents: TalentCardVM[] = [];

  if (mode === "talent") {
    const talents = await prisma.talent.findMany({
      where: { orgId: org.id },
      orderBy: [{ receivedDate: "desc" }, { createdAt: "desc" }],
      select: { id: true, name: true },
    });
    options = talents.map((t) => ({ value: t.id, label: t.name }));

    if (talentId) {
      const t = await prisma.talent.findFirst({ where: { id: talentId, orgId: org.id } });
      if (t) {
        talentVM = {
          id: t.id,
          name: t.name,
          status: t.status,
          talentType: t.talentType,
          age: t.age,
          gender: t.gender,
          affiliation: t.affiliation,
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
        const matches = await prisma.match.findMany({
          where: { talentId: t.id, project: { orgId: org.id }, score: { gte: 70 } },
          include: { project: true },
          orderBy: { score: "desc" },
        });
        rightProjects = matches.map((m) => ({
          matchId: m.id,
          score: m.score,
          reasons: m.reasons,
          proposable: m.proposable,
          channelNote: m.channelNote,
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
          description: m.project.description,
          channelText: m.project.channelText,
          supportFee: m.project.supportFee,
          emailSubject: m.project.emailSubject,
          emailBody: m.project.emailBody,
          emailFrom: m.project.emailFrom,
          emailTo: m.project.emailTo,
          sourceEmail: m.project.sourceEmail,
          receivedDate: m.project.receivedDate ? m.project.receivedDate.toISOString() : null,
        }));
      }
    }
  } else {
    const projects = await prisma.project.findMany({
      where: { orgId: org.id },
      orderBy: [{ receivedDate: "desc" }, { createdAt: "desc" }],
      select: { id: true, title: true },
    });
    options = projects.map((p) => ({ value: p.id, label: p.title }));

    if (projectId) {
      const p = await prisma.project.findFirst({ where: { id: projectId, orgId: org.id } });
      if (p) {
        projectVM = {
          id: p.id,
          title: p.title,
          status: p.status,
          clientName: p.clientName,
          requiredSkills: p.requiredSkills,
          rateMin: p.rateMin,
          rateMax: p.rateMax,
          remotePreference: p.remotePreference,
          location: p.location,
          startText: p.startText,
          description: p.description,
          channelText: p.channelText,
          supportFee: p.supportFee,
          emailSubject: p.emailSubject,
          emailBody: p.emailBody,
          emailFrom: p.emailFrom,
          emailTo: p.emailTo,
          sourceEmail: p.sourceEmail,
          receivedDate: p.receivedDate ? p.receivedDate.toISOString() : null,
        };
        const matches = await prisma.match.findMany({
          where: { projectId: p.id, talent: { orgId: org.id }, score: { gte: 70 } },
          include: { talent: true },
          orderBy: { score: "desc" },
        });
        rightTalents = matches.map((m) => ({
          matchId: m.id,
          score: m.score,
          reasons: m.reasons,
          proposable: m.proposable,
          channelNote: m.channelNote,
          id: m.talent.id,
          name: m.talent.name,
          talentType: m.talent.talentType,
          age: m.talent.age,
          gender: m.talent.gender,
          affiliation: m.talent.affiliation,
          status: m.talent.status,
          desiredRateMin: m.talent.desiredRateMin,
          desiredRateMax: m.talent.desiredRateMax,
          remotePreference: m.talent.remotePreference,
          availabilityText: m.talent.availabilityText,
          nearestStation: m.talent.nearestStation,
          mainSkills: m.talent.mainSkills,
          skills: m.talent.skills,
          note: m.talent.note,
          emailSubject: m.talent.emailSubject,
          emailBody: m.talent.emailBody,
          emailFrom: m.talent.emailFrom,
          emailTo: m.talent.emailTo,
          sourceEmail: m.talent.sourceEmail,
          receivedDate: m.talent.receivedDate ? m.talent.receivedDate.toISOString() : null,
        }));
      }
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">見比べ</h1>
        <p className="mt-1 text-sm text-muted">
          人材と案件を左右に並べて見比べられます。起点（人材／案件）を切り替えられます。
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <CompareView
          mode={mode}
          options={options}
          selectedId={mode === "talent" ? talentId : projectId}
          talent={talentVM}
          project={projectVM}
          rightProjects={rightProjects}
          rightTalents={rightTalents}
        />
      </div>
    </div>
  );
}
