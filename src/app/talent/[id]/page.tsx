import { notFound } from "next/navigation";
import { getCurrentOrg, getOrgUsers } from "@/lib/current-org";
import { prisma } from "@/lib/prisma";
import { TalentForm } from "@/components/talent-form";
import { Badge, statusTone } from "@/components/ui/badge";
import { TALENT_STATUS_LABELS } from "@/lib/enums";
import { DeleteTalentButton } from "./delete-button";

export default async function TalentDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const org = await getCurrentOrg();
  // users と talent は org.id があれば独立に取れるので並列化。
  const [users, talent] = await Promise.all([
    getOrgUsers(org.id),
    prisma.talent.findFirst({
      where: { id, orgId: org.id },
      include: { assignee: true, attachments: true },
    }),
  ]);

  if (!talent) notFound();

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-slate-800">{talent.name}</h1>
            <Badge tone={statusTone(talent.status)}>
              {TALENT_STATUS_LABELS[talent.status] ?? talent.status}
            </Badge>
          </div>
          {talent.managementId && (
            <p className="text-xs text-slate-400 font-mono">ID: {talent.managementId}</p>
          )}
        </div>
        <DeleteTalentButton id={talent.id} />
      </div>
      <TalentForm
        mode="edit"
        users={users}
        initial={{
          id: talent.id,
          managementId: talent.managementId,
          status: talent.status,
          talentType: talent.talentType,
          dataFrom: talent.dataFrom,
          assigneeId: talent.assigneeId,
          name: talent.name,
          age: talent.age,
          gender: talent.gender,
          affiliation: talent.affiliation,
          employmentType: talent.employmentType,
          nationality: talent.nationality,
          japaneseLevel: talent.japaneseLevel,
          englishLevel: talent.englishLevel,
          availabilityText: talent.availabilityText,
          desiredRateMin: talent.desiredRateMin,
          desiredRateMax: talent.desiredRateMax,
          remotePreference: talent.remotePreference,
          nearestStation: talent.nearestStation,
          mainSkills: talent.mainSkills,
          skills: talent.skills,
          qualifications: talent.qualifications,
          tags: talent.tags,
          emailSubject: talent.emailSubject,
          note: talent.note,
          summaryText: talent.summaryText,
        }}
      />
    </div>
  );
}
