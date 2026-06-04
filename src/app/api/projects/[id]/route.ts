import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";

function splitComma(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string") {
    return v
      .split(/[,、]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const org = await getCurrentOrg();

    const project = await prisma.project.findFirst({
      where: { id, orgId: org.id },
      include: {
        assignee: true,
        matches: { include: { talent: true }, orderBy: { score: "desc" } },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const org = await getCurrentOrg();

    // Verify ownership
    const existing = await prisma.project.findFirst({
      where: { id, orgId: org.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();

    const project = await prisma.project.update({
      where: { id },
      data: {
        title: String(body.title),
        managementId: body.managementId ?? null,
        clientName: body.clientName ?? null,
        businessFlow: body.businessFlow ?? null,
        status: body.status ?? existing.status,
        dataFrom: body.dataFrom ?? existing.dataFrom,
        assigneeId: body.assigneeId ?? null,
        description: body.description ?? null,
        requiredSkills: splitComma(body.requiredSkills),
        tags: splitComma(body.tags),
        rateMin: toInt(body.rateMin),
        rateMax: toInt(body.rateMax),
        remotePreference: body.remotePreference ?? null,
        location: body.location ?? null,
        nearestStation: body.nearestStation ?? null,
        startText: body.startText ?? null,
      },
    });

    return NextResponse.json(project);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const org = await getCurrentOrg();

    const existing = await prisma.project.findFirst({
      where: { id, orgId: org.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.project.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
