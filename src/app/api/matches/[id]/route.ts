import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { isStageKey } from "@/lib/pipeline";

/**
 * マッチの更新（提案管理）。
 * - { stage, on }      … パイプライン段階のチェック on/off（達成日時の set/clear）
 * - { reject, reason } … 差し戻し（送らない）。理由を履歴に記録し、一覧から隠す
 * - { restore: true }  … 差し戻しの解除（一覧に戻す）
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const org = await getCurrentOrg();
    const match = await prisma.match.findUnique({
      where: { id },
      include: {
        talent: { select: { orgId: true, name: true } },
        project: { select: { orgId: true, title: true } },
      },
    });
    if (!match || match.talent.orgId !== org.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await req.json()) as {
      stage?: string;
      on?: boolean;
      reject?: boolean;
      reason?: string;
      restore?: boolean;
    };

    // 差し戻し
    if (body.reject) {
      const reason = (body.reason ?? "").trim();
      if (!reason) {
        return NextResponse.json({ error: "差し戻しの理由を入力してください" }, { status: 400 });
      }
      await prisma.$transaction([
        prisma.match.update({
          where: { id },
          data: { rejectedAt: new Date(), rejectReason: reason },
        }),
        prisma.matchRejection.create({
          data: {
            orgId: org.id,
            talentId: match.talentId,
            projectId: match.projectId,
            reason,
            projectTitle: match.project.title,
            talentName: match.talent.name,
            score: match.score,
          },
        }),
      ]);
      return NextResponse.json({ ok: true });
    }

    // 差し戻し解除
    if (body.restore) {
      await prisma.match.update({
        where: { id },
        data: { rejectedAt: null, rejectReason: null },
      });
      return NextResponse.json({ ok: true });
    }

    // パイプライン段階の on/off
    if (isStageKey(body.stage)) {
      await prisma.match.update({
        where: { id },
        data: { [body.stage]: body.on ? new Date() : null },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "更新内容がありません" }, { status: 400 });
  } catch (err) {
    console.error("[PATCH /api/matches/[id]]", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
