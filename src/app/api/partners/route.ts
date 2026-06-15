import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { buildPartnerWhere, buildPartnerOrderBy, parsePartnerFilters } from "@/lib/data/partner";

function splitComma(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string") return v.split(/[,、]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

export async function GET(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
    const filters = parsePartnerFilters(sp);

    const companies = await prisma.partnerCompany.findMany({
      where: buildPartnerWhere(org.id, filters),
      orderBy: buildPartnerOrderBy(filters),
      include: { _count: { select: { contacts: true } } },
    });
    return NextResponse.json(companies);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const body = await req.json();
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: "会社名は必須です" }, { status: 400 });
    }
    const company = await prisma.partnerCompany.create({
      data: {
        orgId: org.id,
        name: String(body.name).trim(),
        industry: body.industry?.trim() || null,
        phone: body.phone?.trim() || null,
        website: body.website?.trim() || null,
        note: body.note?.trim() || null,
        tags: splitComma(body.tags),
      },
    });
    return NextResponse.json(company, { status: 201 });
  } catch (err) {
    // 会社名ユニーク制約違反など
    const message = err instanceof Error ? err.message : "Internal error";
    if (message.includes("Unique") || message.includes("orgId_name")) {
      return NextResponse.json({ error: "同名の提携先が既に存在します" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
