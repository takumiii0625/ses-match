import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { runMatchingForNew, runMatchingForTalent } from "@/lib/match-run";

// LLM判定を含むため長め。
export const maxDuration = 300;

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
    const { projectId, talentId } = body as { projectId?: string; talentId?: string };

    // 人材起点の手動マッチ: 指定人材（自社保有/他社）を全案件と突き合わせる。
    if (talentId) {
      const talent = await prisma.talent.findFirst({
        where: { id: talentId, orgId: org.id },
        select: { id: true },
      });
      if (!talent) {
        return NextResponse.json({ error: "Talent not found" }, { status: 404 });
      }
      const result = await runMatchingForTalent(org.id, talentId);
      const matches = await prisma.match.findMany({
        where: { talentId },
        include: { talent: true, project: true },
        orderBy: { score: "desc" },
      });
      return NextResponse.json({ matches, saved: result.saved });
    }

    if (!projectId) {
      return NextResponse.json({ error: "projectId or talentId is required" }, { status: 400 });
    }

    // Verify project belongs to org
    const project = await prisma.project.findFirst({
      where: { id: projectId, orgId: org.id },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // この案件を「新規案件」として全人材とLLM再マッチ→Matchに保存。
    // （AnthropicキーがなければmockのヒューリスティックにフォールバックするのでDBは常に更新される）
    const result = await runMatchingForNew(org.id, [], [project.id]);

    // 保存済みマッチを返す（スコア降順）。
    const matches = await prisma.match.findMany({
      where: { projectId: project.id },
      include: { talent: true, project: true },
      orderBy: { score: "desc" },
    });

    return NextResponse.json({ matches, saved: result.saved });
  } catch (err) {
    console.error("[POST /api/matches]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
