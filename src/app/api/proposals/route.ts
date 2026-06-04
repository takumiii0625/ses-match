import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { scoreMatch } from "@/lib/matching";
import { getAI } from "@/lib/ai/index";
import { formatRate } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const body = await req.json();
    const { talentId, projectId } = body as { talentId: string; projectId: string };

    if (!talentId || !projectId) {
      return NextResponse.json(
        { error: "talentId and projectId are required" },
        { status: 400 },
      );
    }

    // Load talent and project scoped to org
    const [talent, project] = await Promise.all([
      prisma.talent.findFirst({ where: { id: talentId, orgId: org.id } }),
      prisma.project.findFirst({ where: { id: projectId, orgId: org.id } }),
    ]);

    if (!talent) {
      return NextResponse.json({ error: "Talent not found" }, { status: 404 });
    }
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Compute match reasons
    const { reasons } = scoreMatch(talent, project);

    // Generate proposal
    const ai = getAI();
    const proposal = await ai.generateProposal({
      talentName: talent.name,
      talentSkills:
        talent.mainSkills.length > 0 ? talent.mainSkills : talent.skills,
      talentRate: formatRate(talent.desiredRateMin, talent.desiredRateMax),
      projectTitle: project.title,
      projectClient: project.clientName ?? undefined,
      matchReasons: reasons,
    });

    return NextResponse.json({ proposal });
  } catch (err) {
    console.error("[POST /api/proposals]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
