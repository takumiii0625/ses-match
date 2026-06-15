import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * 配信停止の実行（公開・認証不要）。
 * - 確認ページのボタン、および List-Unsubscribe-Post（メールクライアントのワンクリック）から呼ばれる。
 * - GETは自動プリフェッチで誤停止する恐れがあるため実行に使わない（POSTのみ）。
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const contact = await prisma.partnerContact.findUnique({
      where: { unsubscribeToken: token },
      select: { id: true, status: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "リンクが無効です" }, { status: 404 });
    }
    if (contact.status !== "UNSUBSCRIBED") {
      await prisma.partnerContact.update({
        where: { id: contact.id },
        data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
