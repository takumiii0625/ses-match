import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { scoreMatch } from "@/lib/matching";

export async function GET(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") ?? undefined;

    const matches = await prisma.match.findMany({
      where: {
        project: { orgId: org.id },
        ...(projectId ? { projectId } : {}),
      },
      include: {
        talent: true,
        project: true,
      },
      orderBy: { score: "desc" },
    });

    return NextResponse.json({ matches });
  } catch (err) {
    console.error("[GET /api/matches]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const body = await req.json();
    const { projectId } = body as { projectId: string };

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    // Verify project belongs to org
    const project = await prisma.project.findFirst({
      where: { id: projectId, orgId: org.id },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Load all talents in org
    const talents = await prisma.talent.findMany({
      where: { orgId: org.id },
    });

    // Compute scores and upsert
    const upsertPromises = talents.map((talent) => {
      const { score, reasons } = scoreMatch(talent, project);
      return prisma.match.upsert({
        where: {
          talentId_projectId: { talentId: talent.id, projectId: project.id },
        },
        create: {
          talentId: talent.id,
          projectId: project.id,
          score,
          reasons,
        },
        update: {
          score,
          reasons,
        },
      });
    });

    await Promise.all(upsertPromises);

    // Return the saved matches sorted desc
    const matches = await prisma.match.findMany({
      where: { projectId: project.id },
      include: { talent: true, project: true },
      orderBy: { score: "desc" },
    });

    return NextResponse.json({ matches });
  } catch (err) {
    console.error("[POST /api/matches]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
