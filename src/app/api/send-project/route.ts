import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { sendMail, buildProjectEmail, transformProjectBody } from "@/lib/email/send";
import { getAI } from "@/lib/ai";

export const maxDuration = 60;

/** From ヘッダ等から素のメールアドレスを取り出す。 */
function parseEmail(s?: string | null): string | null {
  if (!s) return null;
  const m = s.match(/<([^>]+)>/) ?? s.match(/([^\s<>]+@[^\s<>]+)/);
  return m ? m[1].toLowerCase() : null;
}

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

    const [talent, project, lastSent] = await Promise.all([
      prisma.talent.findFirst({
        where: { id: talentId, orgId: org.id },
        select: { id: true, name: true, sourceEmail: true, emailFrom: true, contactName: true, emailBody: true },
      }),
      prisma.project.findFirst({
        where: { id: projectId, orgId: org.id },
        select: { id: true, title: true, emailBody: true, description: true, formattedBody: true },
      }),
      // 二重送信ガード: 同じ人材×案件の送信済み記録（最新）
      prisma.sentEmail.findFirst({
        where: { orgId: org.id, talentId, projectId, status: "SENT" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

    if (!talent || !project) {
      return NextResponse.json({ error: "人材または案件が見つかりません" }, { status: 404 });
    }

    const to = talent.sourceEmail ?? parseEmail(talent.emailFrom);
    if (!to) {
      return NextResponse.json(
        { error: "送信先メールアドレスが不明です（この人材にメールが紐付いていません）" },
        { status: 400 },
      );
    }

    // 案件本文の整形。整形結果は案件にのみ依存するのでProjectにキャッシュし、
    // 2回目以降（プレビュー→送信、同一案件の別人材送信）はLLMを呼ばない。
    // これによりプレビューで確認した本文と送信本文の一致も保証される。
    const raw = project.emailBody || project.description || "";
    let block = !regenerate ? (project.formattedBody ?? "").trim() : "";
    if (!block) {
      try {
        block = (await getAI().formatProjectBody(raw, org.projectEmailPrompt ?? undefined)).trim();
        if (block) {
          // LLM整形に成功したときだけキャッシュ（ルール整形は次回LLM再試行の余地を残す）。
          await prisma.project
            .update({ where: { id: project.id }, data: { formattedBody: block } })
            .catch(() => {});
        }
      } catch {
        /* フォールバックへ */
      }
      if (!block) block = transformProjectBody(raw);
    }

    const { subject, text } = buildProjectEmail({
      talentName: talent.name,
      contactFrom: talent.emailFrom,
      contactName: talent.contactName,
      contactBody: talent.emailBody,
      projectTitle: project.title,
      projectBlock: block,
    });

    // プレビュー: 送信もログもせず、件名・本文・宛先＋送信済み情報を返す（見比べ画面の確認用）。
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

    try {
      const { id } = await sendMail({ to, subject, text });
      await prisma.sentEmail.create({
        data: { orgId: org.id, talentId, projectId, toAddr: to, subject, status: "SENT" },
      });
      return NextResponse.json({ ok: true, id, to });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await prisma.sentEmail
        .create({
          data: { orgId: org.id, talentId, projectId, toAddr: to, subject, status: "FAILED", error: message.slice(0, 500) },
        })
        .catch(() => {});
      return NextResponse.json({ error: `送信に失敗しました: ${message}` }, { status: 502 });
    }
  } catch (err) {
    console.error("[POST /api/send-project]", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
