import { NextRequest, NextResponse } from "next/server";
import { getCurrentOrg } from "@/lib/current-org";
import { prepareTalentProposalMail, sendAndLogTalentProposal } from "@/lib/email/talent-proposal";
import { runBulkSend, normalizePairs, BULK_MAX_PAIRS, type PairResult } from "@/lib/email/bulk-send";

export const maxDuration = 300;

/** 選択した複数マッチの要員提案メールをまとめて送信する。重複（提案済み）は自動スキップ。 */
export async function POST(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const body = (await req.json()) as { pairs?: unknown };
    const pairs = normalizePairs(body.pairs);
    if (pairs.length === 0) {
      return NextResponse.json({ error: "送信対象がありません" }, { status: 400 });
    }
    if (pairs.length > BULK_MAX_PAIRS) {
      return NextResponse.json(
        { error: `一度に送れるのは${BULK_MAX_PAIRS}件までです（選択: ${pairs.length}件）` },
        { status: 400 },
      );
    }

    const summary = await runBulkSend(pairs, async (pair): Promise<PairResult> => {
      const prep = await prepareTalentProposalMail({
        orgId: org.id,
        talentId: pair.talentId,
        projectId: pair.projectId,
      });
      if (!prep.ok) return { ...pair, status: "skipped", reason: prep.error };
      if (prep.mail.lastSentAt) return { ...pair, status: "skipped", reason: "提案済み" };
      await sendAndLogTalentProposal({
        orgId: org.id,
        talentId: pair.talentId,
        projectId: pair.projectId,
        to: prep.mail.to,
        subject: prep.mail.subject,
        text: prep.mail.text,
      });
      return { ...pair, status: "sent", to: prep.mail.to };
    });

    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[POST /api/send-talent/bulk]", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
