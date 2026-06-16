import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { normalizeNgDomain } from "@/lib/ng-company";

/** NG企業の一覧を返す（新しい順）。 */
export async function GET() {
  try {
    const org = await getCurrentOrg();
    const items = await prisma.ngCompany.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** NG企業を追加する。input はメール/ドメイン/URLいずれも可（ドメインに正規化）。 */
export async function POST(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const body = (await req.json()) as { input?: string; name?: string; note?: string };
    const domain = normalizeNgDomain(body.input ?? "");
    if (!domain) {
      return NextResponse.json(
        { error: "会社のドメインまたはメールアドレスを入力してください（フリーメールは指定不可）" },
        { status: 400 },
      );
    }
    const name = body.name?.trim() || null;
    const note = body.note?.trim() || null;
    // 同一ドメインは重複させない（既存なら名前/メモを更新）。
    const item = await prisma.ngCompany.upsert({
      where: { orgId_domain: { orgId: org.id, domain } },
      create: { orgId: org.id, domain, name, note },
      update: { name, note },
    });
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    console.error("[POST /api/ng-companies]", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
