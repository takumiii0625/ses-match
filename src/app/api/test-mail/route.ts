import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { prepareProjectInfoMail } from "@/lib/email/project-mail";
import { sendMail } from "@/lib/email/send";

export const maxDuration = 60;

// テスト送信の固定宛先。実際の紹介元には送らず、ここに送る。
const TEST_ADDR = "t.yoshioka@obfall.co.jp";

/** ランダムなマッチ（提案可・80点以上）を1件選び、案件案内メールを組み立てる。 */
async function pickRandomMail(orgId: string, projectEmailPrompt: string | null) {
  const where = {
    proposable: true,
    score: { gte: 80 },
    project: { orgId },
  } as const;
  const total = await prisma.match.count({ where });
  if (total === 0) return { error: "提案可・80点以上のマッチがありません。先にマッチングを実行してください。" };

  // 送信本文を組み立てられるマッチを最大8回ランダムに試す。
  for (let i = 0; i < 8; i++) {
    const skip = Math.floor(Math.random() * total);
    const m = await prisma.match.findFirst({
      where,
      select: { talentId: true, projectId: true, score: true },
      orderBy: { id: "asc" },
      skip,
    });
    if (!m) continue;
    const prep = await prepareProjectInfoMail({ orgId, projectEmailPrompt, talentId: m.talentId, projectId: m.projectId });
    if (!prep.ok) continue;
    const [talent, project] = await Promise.all([
      prisma.talent.findUnique({ where: { id: m.talentId }, select: { name: true } }),
      prisma.project.findUnique({ where: { id: m.projectId }, select: { title: true } }),
    ]);
    return {
      talentId: m.talentId,
      projectId: m.projectId,
      score: m.score,
      talentName: talent?.name ?? "(不明)",
      projectTitle: project?.title ?? "(不明)",
      subject: prep.mail.subject,
      text: prep.mail.text,
      realTo: prep.mail.to, // 本来の宛先（表示用。実送信はしない）
    };
  }
  return { error: "送信本文を組み立てられるマッチが見つかりませんでした。" };
}

export async function POST(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const body = (await req.json()) as {
      action?: "random" | "send";
      talentId?: string;
      projectId?: string;
    };

    if (body.action === "send") {
      if (!body.talentId || !body.projectId) {
        return NextResponse.json({ error: "talentId と projectId が必要です" }, { status: 400 });
      }
      const prep = await prepareProjectInfoMail({
        orgId: org.id,
        projectEmailPrompt: org.projectEmailPrompt,
        talentId: body.talentId,
        projectId: body.projectId,
      });
      if (!prep.ok) {
        return NextResponse.json({ error: prep.error }, { status: prep.status });
      }
      // テスト宛先に送る（実際の紹介元には送らない・SentEmailにも記録しない）。
      const { id } = await sendMail({ to: TEST_ADDR, subject: prep.mail.subject, text: prep.mail.text });
      return NextResponse.json({ ok: true, id, to: TEST_ADDR });
    }

    // default: random プレビュー
    const result = await pickRandomMail(org.id, org.projectEmailPrompt);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json({ ...result, testAddr: TEST_ADDR });
  } catch (err) {
    console.error("[POST /api/test-mail]", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
