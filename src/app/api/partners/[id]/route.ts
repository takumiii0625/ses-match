import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";

function splitComma(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string") return v.split(/[,、]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const org = await getCurrentOrg();
    const company = await prisma.partnerCompany.findFirst({
      where: { id, orgId: org.id },
      include: { contacts: { orderBy: { createdAt: "asc" } } },
    });
    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(company);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const org = await getCurrentOrg();
    const existing = await prisma.partnerCompany.findFirst({ where: { id, orgId: org.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = await req.json();
    const company = await prisma.partnerCompany.update({
      where: { id },
      data: {
        name: body.name?.trim() || existing.name,
        industry: body.industry?.trim() || null,
        phone: body.phone?.trim() || null,
        website: body.website?.trim() || null,
        note: body.note?.trim() || null,
        tags: splitComma(body.tags),
      },
    });
    return NextResponse.json(company);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const org = await getCurrentOrg();
    const existing = await prisma.partnerCompany.findFirst({ where: { id, orgId: org.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.partnerCompany.delete({ where: { id } }); // contactsはCascadeで削除
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
