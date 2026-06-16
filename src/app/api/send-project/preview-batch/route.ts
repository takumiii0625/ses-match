import { NextRequest, NextResponse } from "next/server";
import { getCurrentOrg } from "@/lib/current-org";
import { prepareProjectInfoMail } from "@/lib/email/project-mail";
import { normalizePairs, BULK_MAX_PAIRS } from "@/lib/email/bulk-send";
import { mapLimit } from "@/lib/limit";

export const maxDuration = 300;

interface PreviewItem {
  talentId: string;
  projectId: string;
  ok: boolean;
  to?: string;
  subject?: string;
  text?: string;
  lastSentAt?: string | null;
  error?: string;
}

/** 複数マッチの案件案内メールのプレビュー（件名・本文・宛先・送信済み）を一括取得する。送信はしない。 */
export async function POST(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const body = (await req.json()) as { pairs?: unknown };
    const pairs = normalizePairs(body.pairs);
    if (pairs.length === 0) {
      return NextResponse.json({ error: "対象がありません" }, { status: 400 });
    }
    if (pairs.length > BULK_MAX_PAIRS) {
      return NextResponse.json(
        { error: `一度に読み込めるのは${BULK_MAX_PAIRS}件までです` },
        { status: 400 },
      );
    }

    const items = await mapLimit(pairs, 4, async (pair): Promise<PreviewItem> => {
      try {
        const prep = await prepareProjectInfoMail({
          orgId: org.id,
          projectEmailPrompt: org.projectEmailPrompt,
          talentId: pair.talentId,
          projectId: pair.projectId,
        });
        if (!prep.ok) {
          return { talentId: pair.talentId, projectId: pair.projectId, ok: false, error: prep.error };
        }
        return {
          talentId: pair.talentId,
          projectId: pair.projectId,
          ok: true,
          to: prep.mail.to,
          subject: prep.mail.subject,
          text: prep.mail.text,
          lastSentAt: prep.mail.lastSentAt ? prep.mail.lastSentAt.toISOString() : null,
        };
      } catch (e) {
        return {
          talentId: pair.talentId,
          projectId: pair.projectId,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    });

    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("[POST /api/send-project/preview-batch]", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
