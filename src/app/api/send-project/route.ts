import { NextRequest, NextResponse } from "next/server";
import { getCurrentOrg } from "@/lib/current-org";
import { prepareProjectInfoMail, sendAndLogProjectInfo } from "@/lib/email/project-mail";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const { talentId, projectId, preview, regenerate } = (await req.json()) as {
      talentId?: string;
      projectId?: string;
      preview?: boolean;
      regenerate?: boolean; // true: 整形キャッシュを使わずLLMで再整形してキャッシュ更新
    };
    if (!talentId || !projectId) {
      return NextResponse.json(
        { error: "talentId と projectId が必要です" },
        { status: 400 },
      );
    }

    const prep = await prepareProjectInfoMail({
      orgId: org.id,
      projectEmailPrompt: org.projectEmailPrompt,
      talentId,
      projectId,
      regenerate,
    });
    if (!prep.ok) {
      return NextResponse.json({ error: prep.error }, { status: prep.status });
    }
    const { to, subject, text, lastSentAt } = prep.mail;

    // プレビュー: 送信もログもせず、件名・本文・宛先＋送信済み情報を返す（見比べ画面の確認用）。
    if (preview) {
      return NextResponse.json({ ok: true, preview: true, to, subject, text, lastSentAt });
    }

    // 二重送信ブロック: 同じ人材×案件に送信済みなら再送信不可（どの画面から呼ばれても適用）。
    if (lastSentAt) {
      const date = lastSentAt.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
      return NextResponse.json(
        { error: `⚠️ ${date}に送信済みのため、再送信はできません` },
        { status: 409 },
      );
    }

    try {
      const { id } = await sendAndLogProjectInfo({ orgId: org.id, talentId, projectId, to, subject, text });
      return NextResponse.json({ ok: true, id, to });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `送信に失敗しました: ${message}` }, { status: 502 });
    }
  } catch (err) {
    console.error("[POST /api/send-project]", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
