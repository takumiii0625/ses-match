import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { getAI } from "@/lib/ai";

export interface ReextractResult {
  scanned: number;
  updated: number;
  skipped: number;
  errors: number;
}

const GENDERS = new Set(["MALE", "FEMALE", "OTHER"]);

/**
 * 既存の人材（メール本文あり・所属/性別が未設定）について、保存済み本文を
 * AIで再解析し、所属(affiliation)・性別(gender)を埋める。
 * 抽出機能を追加する前に取り込んだデータの後追い補完用。
 * 既に入っている項目は上書きしない（未設定のみ補完）。limit 件ずつ処理。
 */
export async function reextractTalentFields(limit = 50): Promise<ReextractResult> {
  const org = await getCurrentOrg();
  const ai = getAI();
  const result: ReextractResult = { scanned: 0, updated: 0, skipped: 0, errors: 0 };

  const talents = await prisma.talent.findMany({
    where: {
      orgId: org.id,
      emailBody: { not: null },
      OR: [{ affiliation: null }, { gender: null }],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  for (const t of talents) {
    result.scanned++;
    try {
      const raw = `件名: ${t.emailSubject ?? ""}\n差出人: ${t.emailFrom ?? ""}\n\n${t.emailBody ?? ""}`;
      const p = await ai.parseTalentEmail(raw, undefined, org.talentPrompt ?? undefined);

      const data: { affiliation?: string; gender?: "MALE" | "FEMALE" | "OTHER" } = {};
      if (t.affiliation == null && p.affiliation) data.affiliation = p.affiliation;
      if (t.gender == null && p.gender && GENDERS.has(p.gender)) {
        data.gender = p.gender as "MALE" | "FEMALE" | "OTHER";
      }

      if (Object.keys(data).length === 0) {
        result.skipped++;
        continue;
      }
      await prisma.talent.update({ where: { id: t.id }, data });
      result.updated++;
    } catch (e) {
      result.errors++;
      console.error(`[reextract] talent ${t.id} 再抽出失敗:`, e);
    }
  }

  return result;
}
