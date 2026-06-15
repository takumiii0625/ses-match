import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { sendMail, buildTalentProposalEmail } from "@/lib/email/send";
import { buildTalentIntroBlock } from "@/lib/email/talent-block";

export const maxDuration = 60;

/** From ヘッダ等から素のメールアドレスを取り出す。 */
function parseEmail(s?: string | null): string | null {
  if (!s) return null;
  const m = s.match(/<([^>]+)>/) ?? s.match(/([^\s<>]+@[^\s<>]+)/);
  return m ? m[1].toLowerCase() : null;
}

/**
 * 自社マッチ用: 案件元（案件メールの送信者）へ要員を提案するメールを送る。
 * 雛形固定・要員情報は人材メール本文（無ければスキルシート要約）をそのまま掲載。
 * LLMは使わない（コストゼロ・本文のブレなし）。
 */
export async function POST(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const { talentId, projectId, preview } = (await req.json()) as {
      talentId?: string;
      projectId?: string;
      preview?: boolean;
    };
    if (!talentId || !projectId) {
      return NextResponse.json(
        { error: "talentId と projectId が必要です" },
        { status: 400 },
      );
    }

    const [talent, project, lastSent] = await Promise.all([
      prisma.talent.findFirst({
        where: { id: talentId, orgId: org.id },
        select: {
          id: true,
          name: true,
          summaryText: true,
          mainSkills: true,
          skills: true,
          desiredRateMin: true,
          desiredRateMax: true,
          availabilityText: true,
        },
      }),
      prisma.project.findFirst({
        where: { id: projectId, orgId: org.id },
        select: { id: true, title: true, sourceEmail: true, emailFrom: true, emailBody: true },
      }),
      // 二重送信ガード: 同じ人材×案件の提案メール送信記録（最新）
      prisma.sentEmail.findFirst({
        where: { orgId: org.id, talentId, projectId, kind: "TALENT_PROPOSAL", status: "SENT" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

    if (!talent || !project) {
      return NextResponse.json({ error: "人材または案件が見つかりません" }, { status: 404 });
    }

    const to = project.sourceEmail ?? parseEmail(project.emailFrom);
    if (!to) {
      return NextResponse.json(
        { error: "送信先メールアドレスが不明です（この案件にメールが紐付いていません）" },
        { status: 400 },
      );
    }

    // 要員情報: 本人固有のみ（氏名見出し＋スキルシート要約 or 構造化項目）。
    // 複数人をまとめた元メール(emailBody)は使わない＝別人の内容混入を防ぐ。
    const talentBlock = buildTalentIntroBlock(talent);

    const { subject, text } = buildTalentProposalEmail({
      contactFrom: project.emailFrom,
      contactBody: project.emailBody,
      projectTitle: project.title,
      talentBlock,
    });

    // プレビュー: 送信もログもせず、件名・本文・宛先＋送信済み情報を返す。
    if (preview) {
      return NextResponse.json({
        ok: true,
        preview: true,
        to,
        subject,
        text,
        lastSentAt: lastSent?.createdAt ?? null,
      });
    }

    // 二重送信ブロック: 同じ人材×案件に提案済みなら再送信不可（どの画面から呼ばれても適用）。
    if (lastSent) {
      const date = lastSent.createdAt.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
      return NextResponse.json(
        { error: `⚠️ ${date}に提案済みのため、再送信はできません` },
        { status: 409 },
      );
    }

    try {
      const { id } = await sendMail({ to, subject, text });
      await prisma.sentEmail.create({
        data: { orgId: org.id, talentId, projectId, kind: "TALENT_PROPOSAL", toAddr: to, subject, status: "SENT" },
      });
      return NextResponse.json({ ok: true, id, to });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await prisma.sentEmail
        .create({
          data: { orgId: org.id, talentId, projectId, kind: "TALENT_PROPOSAL", toAddr: to, subject, status: "FAILED", error: message.slice(0, 500) },
        })
        .catch(() => {});
      return NextResponse.json({ error: `送信に失敗しました: ${message}` }, { status: 502 });
    }
  } catch (err) {
    console.error("[POST /api/send-talent]", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
