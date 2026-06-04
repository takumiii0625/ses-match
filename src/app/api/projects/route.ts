import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { buildProjectWhere, buildProjectOrderBy, parseProjectFilters } from "@/lib/data/project";

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

export async function GET(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
    const filters = parseProjectFilters(sp);

    const projects = await prisma.project.findMany({
      where: buildProjectWhere(org.id, filters),
      orderBy: buildProjectOrderBy(filters),
      include: {
        assignee: true,
        _count: { select: { matches: true } },
      },
    });

    return NextResponse.json(projects);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const body = await req.json();

    const project = await prisma.project.create({
      data: {
        orgId: org.id,
        title: String(body.title),
        managementId: body.managementId ?? null,
        clientName: body.clientName ?? null,
        businessFlow: body.businessFlow ?? null,
        status: body.status ?? "OPEN",
        dataFrom: body.dataFrom ?? "REGISTER",
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

    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
