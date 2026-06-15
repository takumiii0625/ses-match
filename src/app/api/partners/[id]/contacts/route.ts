import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { companyDomain } from "@/lib/matching";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 提携先会社に連絡先を1件追加。 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: companyId } = await ctx.params;
    const org = await getCurrentOrg();
    const company = await prisma.partnerCompany.findFirst({
      where: { id: companyId, orgId: org.id },
      select: { id: true, domain: true },
    });
    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const email = String(body.email ?? "").toLowerCase().trim();
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "メール形式が不正です" }, { status: 400 });
    }

    const contact = await prisma.partnerContact.create({
      data: {
        orgId: org.id,
        companyId,
        email,
        name: body.name?.trim() || null,
        role: body.role?.trim() || null,
        status: "ACTIVE",
      },
    });

    // 会社のdomainが未設定ならこの連絡先から補完。
    if (!company.domain) {
      const d = companyDomain(email);
      if (d) await prisma.partnerCompany.update({ where: { id: companyId }, data: { domain: d } }).catch(() => {});
    }

    return NextResponse.json(contact, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message.includes("Unique") || message.includes("orgId_email")) {
      return NextResponse.json({ error: "このメールは既に登録されています" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
