import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import type { PartnerContactStatus } from "@prisma/client";

const VALID_STATUS: PartnerContactStatus[] = ["ACTIVE", "BOUNCED", "UNSUBSCRIBED"];

/** 連絡先の編集（名前・役職・メール）。 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const org = await getCurrentOrg();
    const existing = await prisma.partnerContact.findFirst({ where: { id, orgId: org.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = await req.json();
    const contact = await prisma.partnerContact.update({
      where: { id },
      data: {
        name: body.name?.trim() || null,
        role: body.role?.trim() || null,
        ...(typeof body.email === "string" && body.email.trim()
          ? { email: body.email.toLowerCase().trim() }
          : {}),
      },
    });
    return NextResponse.json(contact);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message.includes("Unique")) {
      return NextResponse.json({ error: "このメールは既に登録されています" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** 配信状態の変更（配信中⇄停止 トグル等）。 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const org = await getCurrentOrg();
    const existing = await prisma.partnerContact.findFirst({ where: { id, orgId: org.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = await req.json();
    const status = body.status as PartnerContactStatus;
    if (!VALID_STATUS.includes(status)) {
      return NextResponse.json({ error: "不正なステータスです" }, { status: 400 });
    }
    const contact = await prisma.partnerContact.update({
      where: { id },
      data: {
        status,
        unsubscribedAt: status === "UNSUBSCRIBED" ? new Date() : null,
      },
    });
    return NextResponse.json(contact);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const org = await getCurrentOrg();
    const existing = await prisma.partnerContact.findFirst({ where: { id, orgId: org.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.partnerContact.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
