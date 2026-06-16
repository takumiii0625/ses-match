import { NextRequest, NextResponse } from "next/server";
import { getCurrentOrg } from "@/lib/current-org";
import { prepareTalentProposalMail, sendAndLogTalentProposal } from "@/lib/email/talent-proposal";

export const maxDuration = 60;

/**
 * 自社マッチ用: 案件元（案件メールの送信者）へ要員を提案するメールを送る。
 * 雛形固定・LLM不使用（コストゼロ・本文のブレなし）。
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
      return NextResponse.json({ error: "talentId と projectId が必要です" }, { status: 400 });
    }

    const prep = await prepareTalentProposalMail({ orgId: org.id, talentId, projectId });
    if (!prep.ok) {
      return NextResponse.json({ error: prep.error }, { status: prep.status });
    }
    const { to, subject, text, lastSentAt } = prep.mail;

    // プレビュー: 送信もログもせず、件名・本文・宛先＋送信済み情報を返す。
    if (preview) {
      return NextResponse.json({ ok: true, preview: true, to, subject, text, lastSentAt });
    }

    // 二重送信ブロック: 同じ人材×案件に提案済みなら再送信不可。
    if (lastSentAt) {
      const date = lastSentAt.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
      return NextResponse.json(
        { error: `⚠️ ${date}に提案済みのため、再送信はできません` },
        { status: 409 },
      );
    }

    try {
      const { id } = await sendAndLogTalentProposal({ orgId: org.id, talentId, projectId, to, subject, text });
      return NextResponse.json({ ok: true, id, to });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `送信に失敗しました: ${message}` }, { status: 502 });
    }
  } catch (err) {
    console.error("[POST /api/send-talent]", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
