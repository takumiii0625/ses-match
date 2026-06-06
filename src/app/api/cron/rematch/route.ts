import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { scoreMatch, isSameCompany } from "@/lib/matching";

export const maxDuration = 300;

const authEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const MIN_SCORE = 50;

async function authorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const header =
      req.headers.get("x-cron-secret") ?? url.searchParams.get("secret");
    const authH = req.headers.get("authorization");
    if (header === secret || authH === `Bearer ${secret}`) return true;
  }
  if (authEnabled) {
    try {
      const { userId } = await auth();
      if (userId) return true;
    } catch {}
  }
  return !secret && !authEnabled;
}

async function handle(req: Request) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const org = await getCurrentOrg();
    const [projects, talents] = await Promise.all([
      prisma.project.findMany({ where: { orgId: org.id } }),
      prisma.talent.findMany({ where: { orgId: org.id } }),
    ]);

    let saved = 0;
    let pairs = 0;
    for (const project of projects) {
      for (const talent of talents) {
        pairs++;
        if (isSameCompany(talent, project)) continue;
        const { score, reasons } = scoreMatch(talent, project);
        if (score < MIN_SCORE) continue;
        await prisma.match.upsert({
          where: {
            talentId_projectId: { talentId: talent.id, projectId: project.id },
          },
          create: { talentId: talent.id, projectId: project.id, score, reasons },
          update: { score, reasons },
        });
        saved++;
      }
    }

    return NextResponse.json({
      projects: projects.length,
      talents: talents.length,
      pairs,
      saved,
      minScore: MIN_SCORE,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
