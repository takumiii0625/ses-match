import { Prisma } from "@prisma/client";
import type { MatchVM } from "./matches-list";

// VM化に必要な列だけ取得する select。emailBody（フルのメール本文）等の重い列を読まず、
// Neonのネットワーク転送量を削減する（無料枠の超過対策）。一覧ページで共通利用。
export const matchVmSelect = {
  id: true,
  score: true,
  reasons: true,
  proposable: true,
  channelNote: true,
  talent: {
    select: {
      id: true,
      name: true,
      talentType: true,
      affiliation: true,
      mainSkills: true,
      skills: true,
      desiredRateMin: true,
      desiredRateMax: true,
      remotePreference: true,
      receivedDate: true,
    },
  },
  project: {
    select: {
      id: true,
      title: true,
      clientName: true,
      rateMin: true,
      rateMax: true,
      requiredSkills: true,
      receivedDate: true,
      channelText: true,
      supportFee: true,
    },
  },
} satisfies Prisma.MatchSelect;

type MatchVmRow = Prisma.MatchGetPayload<{ select: typeof matchVmSelect }>;

/** Prisma の Match(+talent,+project) を、クライアント用 VM に直列化する。 */
export function toMatchVM(m: MatchVmRow): MatchVM {
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
      affiliation: m.talent.affiliation,
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
