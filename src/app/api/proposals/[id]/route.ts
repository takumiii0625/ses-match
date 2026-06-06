import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const org = await getCurrentOrg();

    const proposal = await prisma.proposal.findFirst({
      where: { id, orgId: org.id },
      include: {
        talent: { select: { id: true, name: true, mainSkills: true, skills: true, desiredRateMin: true, desiredRateMax: true } },
        project: { select: { id: true, title: true, clientName: true, requiredSkills: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ proposal });
  } catch (err) {
    console.error("[GET /api/proposals/[id]]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const org = await getCurrentOrg();

    const existing = await prisma.proposal.findFirst({ where: { id, orgId: org.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const { status, proposalBody, subject } = body as {
      status?: string;
      proposalBody?: string;
      subject?: string;
    };

    const updated = await prisma.proposal.update({
      where: { id },
      data: {
        ...(status !== undefined ? { status: status as never } : {}),
        ...(proposalBody !== undefined ? { body: proposalBody } : {}),
        ...(subject !== undefined ? { subject } : {}),
      },
    });

    return NextResponse.json({ proposal: updated });
  } catch (err) {
    console.error("[PATCH /api/proposals/[id]]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const org = await getCurrentOrg();

    const existing = await prisma.proposal.findFirst({ where: { id, orgId: org.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.proposal.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/proposals/[id]]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
