import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";

export async function GET(_req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const links = await prisma.sharedLink.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(links);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const body = await req.json();

    const { type, targetId, label, expiresInDays } = body as {
      type: string;
      targetId?: string;
      label?: string;
      expiresInDays?: number;
    };

    if (!type || !["TALENT", "PROJECT", "TALENT_LIST"].includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const token = crypto.randomUUID().replace(/-/g, "");

    // 有効期限: 既定30日（無期限の共有リンクが残り続けるのを防ぐ）。最大365日。
    const days = Math.min(Math.max(Number(expiresInDays) || 30, 1), 365);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const link = await prisma.sharedLink.create({
      data: {
        orgId: org.id,
        token,
        type: type as "TALENT" | "PROJECT" | "TALENT_LIST",
        targetId: targetId ?? null,
        label: label ?? null,
        expiresAt,
      },
    });

    return NextResponse.json(
      { id: link.id, token: link.token, url: `/share/${link.token}` },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
