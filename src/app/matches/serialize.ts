import type { Match, Talent, Project } from "@prisma/client";
import type { MatchVM } from "./matches-list";

/** Prisma の Match(+talent,+project) を、クライアント用 VM に直列化する。 */
export function toMatchVM(m: Match & { talent: Talent; project: Project }): MatchVM {
  return {
    id: m.id,
    score: m.score,
    reasons: m.reasons,
    proposable: m.proposable,
    channelNote: m.channelNote,
    talent: {
      id: m.talent.id,
      name: m.talent.name,
      talentType: m.talent.talentType,
      mainSkills: m.talent.mainSkills,
      skills: m.talent.skills,
      desiredRateMin: m.talent.desiredRateMin,
      desiredRateMax: m.talent.desiredRateMax,
      remotePreference: m.talent.remotePreference,
      receivedDate: m.talent.receivedDate ? m.talent.receivedDate.toISOString() : null,
    },
    project: {
      id: m.project.id,
      title: m.project.title,
      clientName: m.project.clientName,
      rateMin: m.project.rateMin,
      rateMax: m.project.rateMax,
      requiredSkills: m.project.requiredSkills,
      receivedDate: m.project.receivedDate ? m.project.receivedDate.toISOString() : null,
      channelText: m.project.channelText,
      supportFee: m.project.supportFee,
    },
  };
}
