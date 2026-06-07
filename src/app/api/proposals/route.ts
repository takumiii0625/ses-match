import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { scoreMatch } from "@/lib/matching";
import { getAI } from "@/lib/ai/index";
import { formatRate } from "@/lib/utils";

export async function GET(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const proposals = await prisma.proposal.findMany({
      where: {
        orgId: org.id,
        ...(status ? { status: status as never } : {}),
      },
      include: {
        talent: { select: { id: true, name: true, mainSkills: true, skills: true } },
        project: { select: { id: true, title: true, clientName: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ proposals });
  } catch (err) {
    console.error("[GET /api/proposals]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const body = await req.json();

    // --- save action ---
    if (body.action === "save") {
      const { talentId, projectId, proposalBody, subject } = body as {
        action: "save";
        talentId: string;
        projectId: string;
        proposalBody: string;
        subject?: string;
      };

      if (!talentId || !projectId || !proposalBody) {
        return NextResponse.json(
          { error: "talentId, projectId, and proposalBody are required" },
          { status: 400 },
        );
      }

      const [talent, project] = await Promise.all([
        prisma.talent.findFirst({ where: { id: talentId, orgId: org.id } }),
        prisma.project.findFirst({ where: { id: projectId, orgId: org.id } }),
      ]);

      if (!talent) return NextResponse.json({ error: "Talent not found" }, { status: 404 });
      if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

      const { score } = scoreMatch(talent, project);

      const proposal = await prisma.proposal.create({
        data: {
          orgId: org.id,
          talentId,
          projectId,
          body: proposalBody,
          subject: subject ?? null,
          status: "DRAFT",
          score,
        },
      });

      return NextResponse.json({ id: proposal.id });
    }

    // --- generate action (default) ---
    const { talentId, projectId } = body as { talentId: string; projectId: string };

    if (!talentId || !projectId) {
      return NextResponse.json(
        { error: "talentId and projectId are required" },
        { status: 400 },
      );
    }

    const [talent, project] = await Promise.all([
      prisma.talent.findFirst({ where: { id: talentId, orgId: org.id } }),
      prisma.project.findFirst({ where: { id: projectId, orgId: org.id } }),
    ]);

    if (!talent) return NextResponse.json({ error: "Talent not found" }, { status: 404 });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const { reasons } = scoreMatch(talent, project);

    const ai = getAI();
    const proposal = await ai.generateProposal(
      {
        talentName: talent.name,
        talentSkills: talent.mainSkills.length > 0 ? talent.mainSkills : talent.skills,
        talentRate: formatRate(talent.desiredRateMin, talent.desiredRateMax),
        projectTitle: project.title,
        projectClient: project.clientName ?? undefined,
        matchReasons: reasons,
      },
      org.proposalPrompt ?? undefined,
    );

    return NextResponse.json({ proposal });
  } catch (err) {
    console.error("[POST /api/proposals]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
