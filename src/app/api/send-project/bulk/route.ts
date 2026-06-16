import { NextRequest, NextResponse } from "next/server";
import { getCurrentOrg } from "@/lib/current-org";
import { prepareProjectInfoMail, sendAndLogProjectInfo } from "@/lib/email/project-mail";
import { mapLimit } from "@/lib/limit";

export const maxDuration = 300;

// 1リクエストで送る上限（タイムアウト・誤爆防止）。これを超える選択は分割して送る。
const MAX_PAIRS = 100;
// 同時送信数（Resend へのバースト抑制）。
const SEND_CONCURRENCY = 3;

type Pair = { talentId: string; projectId: string };
type ResultStatus = "sent" | "skipped" | "failed";
interface PairResult extends Pair {
  status: ResultStatus;
  to?: string;
  reason?: string;
}

/** 選択した複数マッチの案件案内メールをまとめて送信する。重複（送信済み）は自動スキップ。 */
export async function POST(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const body = (await req.json()) as { pairs?: Pair[] };
    const rawPairs = Array.isArray(body.pairs) ? body.pairs : [];
    // 正常な talentId/projectId のみ・重複ペアを除外。
    const seen = new Set<string>();
    const pairs: Pair[] = [];
    for (const p of rawPairs) {
      if (!p || typeof p.talentId !== "string" || typeof p.projectId !== "string") continue;
      const key = `${p.talentId}:${p.projectId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ talentId: p.talentId, projectId: p.projectId });
    }
    if (pairs.length === 0) {
      return NextResponse.json({ error: "送信対象がありません" }, { status: 400 });
    }
    if (pairs.length > MAX_PAIRS) {
      return NextResponse.json(
        { error: `一度に送れるのは${MAX_PAIRS}件までです（選択: ${pairs.length}件）` },
        { status: 400 },
      );
    }

    const results = await mapLimit(pairs, SEND_CONCURRENCY, async (pair): Promise<PairResult> => {
      try {
        const prep = await prepareProjectInfoMail({
          orgId: org.id,
          projectEmailPrompt: org.projectEmailPrompt,
          talentId: pair.talentId,
          projectId: pair.projectId,
        });
        if (!prep.ok) {
          return { ...pair, status: "skipped", reason: prep.error };
        }
        // 二重送信ガード: 送信済みはスキップ。
        if (prep.mail.lastSentAt) {
          return { ...pair, status: "skipped", reason: "送信済み" };
        }
        await sendAndLogProjectInfo({
          orgId: org.id,
          talentId: pair.talentId,
          projectId: pair.projectId,
          to: prep.mail.to,
          subject: prep.mail.subject,
          text: prep.mail.text,
          inReplyTo: prep.mail.inReplyTo,
        });
        return { ...pair, status: "sent", to: prep.mail.to };
      } catch (e) {
        return { ...pair, status: "failed", reason: e instanceof Error ? e.message : String(e) };
      }
    });

    const sent = results.filter((r) => r.status === "sent").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const failed = results.filter((r) => r.status === "failed").length;
    return NextResponse.json({ ok: true, sent, skipped, failed, results });
  } catch (err) {
    console.error("[POST /api/send-project/bulk]", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
