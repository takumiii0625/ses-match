import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { getAI } from "@/lib/ai";

export interface ReextractResult {
  total: number; // 本文ありの人材総数
  processed: number; // ここまで処理した件数（= 次回 offset）
  done: boolean;
  updated: number;
  skipped: number;
  errors: number;
}

const GENDERS = new Set(["MALE", "FEMALE", "OTHER"]);

/**
 * 既存の人材（メール本文あり）を offset/limit で分割しながらAI再解析し、
 * 未設定の所属(affiliation)・性別(gender)を補完する。
 * 安定した順序（作成日昇順）で全件を一度ずつ処理するので、繰り返し呼べば全件完了する。
 * 既に入っている項目は上書きしない。
 */
export async function reextractTalentFields(
  offset = 0,
  limit = 8,
): Promise<ReextractResult> {
  const org = await getCurrentOrg();
  const ai = getAI();

  const total = await prisma.talent.count({
    where: { orgId: org.id, emailBody: { not: null } },
  });

  const talents = await prisma.talent.findMany({
    where: { orgId: org.id, emailBody: { not: null } },
    orderBy: { createdAt: "asc" },
    skip: Math.max(0, offset),
    take: limit > 0 ? limit : 8,
  });

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const t of talents) {
    // 両方とも入っていれば再解析不要。
    if (t.affiliation != null && t.gender != null) {
      skipped++;
      continue;
    }
    try {
      const raw = `件名: ${t.emailSubject ?? ""}\n差出人: ${t.emailFrom ?? ""}\n\n${t.emailBody ?? ""}`;
      const p = await ai.parseTalentEmail(raw, undefined, org.talentPrompt ?? undefined);

      const data: { affiliation?: string; gender?: "MALE" | "FEMALE" | "OTHER" } = {};
      if (t.affiliation == null && p.affiliation) data.affiliation = p.affiliation;
      if (t.gender == null && p.gender && GENDERS.has(p.gender)) {
        data.gender = p.gender as "MALE" | "FEMALE" | "OTHER";
      }

      if (Object.keys(data).length === 0) {
        skipped++;
        continue;
      }
      await prisma.talent.update({ where: { id: t.id }, data });
      updated++;
    } catch (e) {
      errors++;
      console.error(`[reextract] talent ${t.id} 再抽出失敗:`, e);
    }
  }

  const processed = Math.min(offset + talents.length, total);
  return {
    total,
    processed,
    done: processed >= total,
    updated,
    skipped,
    errors,
  };
}

/**
 * 既存の案件（メール本文あり）を offset/limit で分割しながらAI再解析し、
 * 未設定の商流(channelText)・支援費(supportFee)を補完する。
 * channelText が未設定（null）の案件だけを対象にする（抽出済みは上書きしない）。
 */
export async function reextractProjectFields(
  offset = 0,
  limit = 8,
): Promise<ReextractResult> {
  const org = await getCurrentOrg();
  const ai = getAI();

  // ページングを安定させるため「本文あり全件」を作成日昇順で一度ずつ処理し、
  // 商流が既に入っている案件は skip（上書きしない）。
  const where = { orgId: org.id, emailBody: { not: null } };
  const total = await prisma.project.count({ where });

  const projects = await prisma.project.findMany({
    where,
    orderBy: { createdAt: "asc" },
    skip: Math.max(0, offset),
    take: limit > 0 ? limit : 8,
  });

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const p of projects) {
    if (p.channelText != null) {
      skipped++; // すでに商流抽出済み
      continue;
    }
    try {
      const raw = `件名: ${p.emailSubject ?? ""}\n差出人: ${p.emailFrom ?? ""}\n\n${p.emailBody ?? ""}`;
      const parsed = await ai.parseProjectEmail(raw, undefined, org.projectPrompt ?? undefined);

      const data: { channelText?: string; supportFee?: boolean } = {};
      if (parsed.channelText) data.channelText = parsed.channelText;
      if (parsed.supportFee) data.supportFee = true;

      if (Object.keys(data).length === 0) {
        skipped++; // メールに商流記載なし
        continue;
      }
      await prisma.project.update({ where: { id: p.id }, data });
      updated++;
    } catch (e) {
      errors++;
      console.error(`[reextract] project ${p.id} 再抽出失敗:`, e);
    }
  }

  const processed = Math.min(offset + projects.length, total);
  return {
    total,
    processed,
    done: processed >= total,
    updated,
    skipped,
    errors,
  };
}
