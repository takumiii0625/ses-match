import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { fetchEmailById } from "./gmail";

export interface BackfillResult {
  scanned: number;
  updatedTalents: number;
  updatedProjects: number;
  skipped: number;
  errors: number;
}

/**
 * 既存の取り込み済みレコード（IngestedEmail）について、Gmailから本文/From/To を
 * 取り直し、対応する Talent / Project の emailBody 等を補完する。
 * - 既定: emailBody が空のものだけ補完（既存はスキップ）。
 * - overwrite=true: 既存の emailBody も再取得して上書き（HTML抽出の改善などを反映）。
 *   案件は整形キャッシュ(formattedBody)もクリアし、案内メールが新本文で作り直される。
 */
export async function backfillEmailBodies(
  limit = 200,
  opts: { overwrite?: boolean; offset?: number } = {},
): Promise<BackfillResult> {
  const overwrite = opts.overwrite === true;
  const org = await getCurrentOrg();
  const result: BackfillResult = {
    scanned: 0,
    updatedTalents: 0,
    updatedProjects: 0,
    skipped: 0,
    errors: 0,
  };

  const records = await prisma.ingestedEmail.findMany({
    where: {
      orgId: org.id,
      gmailId: { not: null },
      OR: [{ talentId: { not: null } }, { projectId: { not: null } }],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: Math.max(0, opts.offset ?? 0),
  });

  for (const rec of records) {
    result.scanned++;

    // overwrite でなければ、既に本文が入っているものはスキップ。
    if (!overwrite) {
      if (rec.talentId) {
        const t = await prisma.talent.findUnique({
          where: { id: rec.talentId },
          select: { emailBody: true },
        });
        if (!t) { result.skipped++; continue; }
        if (t.emailBody) { result.skipped++; continue; }
      } else if (rec.projectId) {
        const p = await prisma.project.findUnique({
          where: { id: rec.projectId },
          select: { emailBody: true },
        });
        if (!p) { result.skipped++; continue; }
        if (p.emailBody) { result.skipped++; continue; }
      }
    }

    try {
      const mail = await fetchEmailById(rec.gmailId!);
      if (!mail) { result.errors++; continue; }

      const data = {
        emailBody: mail.text || null,
        emailFrom: mail.from ?? null,
        emailTo: mail.to ?? null,
        emailSubject: mail.subject ?? null,
      };

      // 添付スキルシート（PDF/Excel/Word）の抽出テキスト。再取得で復旧できるよう取り直す。
      const skillSheetText =
        mail.attachments
          .filter((a) => a.text?.trim())
          .map((a) => `【${a.filename}】\n${a.text!.trim()}`)
          .join("\n\n")
          .slice(0, 8000) || null;

      if (rec.talentId) {
        // 抽出できたときだけ summaryText を更新（既存を空で潰さない）。
        await prisma.talent.update({
          where: { id: rec.talentId },
          data: skillSheetText ? { ...data, summaryText: skillSheetText } : data,
        });
        result.updatedTalents++;
      } else if (rec.projectId) {
        // 本文が変わるので整形キャッシュをクリア（案内メールが新本文で作り直される）。
        await prisma.project.update({
          where: { id: rec.projectId },
          data: overwrite ? { ...data, formattedBody: null } : data,
        });
        result.updatedProjects++;
      }
    } catch {
      result.errors++;
    }
  }

  return result;
}
