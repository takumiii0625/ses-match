import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/data/current-user";

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // "talent" | "project" | null (all)

    const where: Record<string, unknown> = { userId: user.id };
    if (type === "talent") where.talentId = { not: null };
    if (type === "project") where.projectId = { not: null };

    const favorites = await prisma.favorite.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        talent: true,
        project: true,
      },
    });

    return NextResponse.json(favorites);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    const body = await req.json();

    const talentId: string | undefined = body.talentId ?? undefined;
    const projectId: string | undefined = body.projectId ?? undefined;

    if (!talentId && !projectId) {
      return NextResponse.json(
        { error: "talentId or projectId is required" },
        { status: 400 },
      );
    }

    if (talentId) {
      const existing = await prisma.favorite.findUnique({
        where: { userId_talentId: { userId: user.id, talentId } },
      });
      if (existing) {
        await prisma.favorite.delete({ where: { id: existing.id } });
        return NextResponse.json({ favorited: false });
      } else {
        await prisma.favorite.create({
          data: { userId: user.id, talentId },
        });
        return NextResponse.json({ favorited: true });
      }
    }

    // projectId branch
    const existing = await prisma.favorite.findUnique({
      where: { userId_projectId: { userId: user.id, projectId: projectId! } },
    });
    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      return NextResponse.json({ favorited: false });
    } else {
      await prisma.favorite.create({
        data: { userId: user.id, projectId: projectId! },
      });
      return NextResponse.json({ favorited: true });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
