import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { buildTalentIntroEmail } from "@/lib/email/send";
import { buildTalentIntroBlock, joinTalentBlocks } from "@/lib/email/talent-block";

export const maxDuration = 30;

/**
 * 一斉案内のプレビュー: 選択人材から本文を生成し、配信中の宛先件数を返す（送信なし）。
 */
export async function POST(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const { talentIds, excludeContactIds } = (await req.json()) as {
      talentIds?: string[];
      excludeContactIds?: string[];
    };
    if (!talentIds?.length) {
      return NextResponse.json({ error: "紹介する人材を1名以上選んでください" }, { status: 400 });
    }

    const talents = await prisma.talent.findMany({
      where: { id: { in: talentIds }, orgId: org.id },
      select: {
        id: true,
        name: true,
        summaryText: true,
        mainSkills: true,
        skills: true,
        desiredRateMin: true,
        desiredRateMax: true,
        availabilityText: true,
      },
    });
    if (talents.length === 0) {
      return NextResponse.json({ error: "人材が見つかりません" }, { status: 404 });
    }

    const talentsBlock = joinTalentBlocks(talents.map((t) => buildTalentIntroBlock(t)));
    const { subject, text } = buildTalentIntroEmail({ talentsBlock });

    // 配信中の宛先（除外を差し引く）。
    const exclude = new Set(excludeContactIds ?? []);
    const contacts = await prisma.partnerContact.findMany({
      where: { orgId: org.id, status: "ACTIVE" },
      select: { id: true, email: true, company: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    const recipients = contacts.filter((c) => !exclude.has(c.id));

    return NextResponse.json({
      subject,
      text,
      talentCount: talents.length,
      recipientCount: recipients.length,
      sampleRecipients: recipients.slice(0, 5).map((c) => ({
        id: c.id,
        email: c.email,
        company: c.company.name,
      })),
    });
  } catch (err) {
    console.error("[POST /api/blast/preview]", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
