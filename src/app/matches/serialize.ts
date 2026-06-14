import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { MatchVM } from "./matches-list";

/** talentId#projectId → 案件案内メールの最新送信日時(ISO) のマップを作る（送信済みバッジ用）。 */
export async function buildSentInfoMap(orgId: string): Promise<Map<string, string>> {
  const sent = await prisma.sentEmail.findMany({
    where: { orgId, kind: "PROJECT_INFO", status: "SENT" },
    select: { talentId: true, projectId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const map = new Map<string, string>();
  for (const s of sent) {
    const key = `${s.talentId}#${s.projectId}`;
    if (!map.has(key)) map.set(key, s.createdAt.toISOString()); // 最新（降順の先頭）を採用
  }
  return map;
}

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

/**
 * Prisma の Match(+talent,+project) を、クライアント用 VM に直列化する。
 * sentInfoAt は呼び出し側で算出した「この人材×案件の案件案内メール送信日時」（ISO文字列 or null）。
 */
export function toMatchVM(m: MatchVmRow, sentInfoAt: string | null = null): MatchVM {
  return {
    id: m.id,
    score: m.score,
    reasons: m.reasons,
    proposable: m.proposable,
    channelNote: m.channelNote,
    sentInfoAt,
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
