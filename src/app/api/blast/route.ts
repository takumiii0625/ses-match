import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { buildTalentIntroEmail } from "@/lib/email/send";
import { buildTalentBlock, joinTalentBlocks } from "@/lib/email/talent-block";

export const maxDuration = 60;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
function startOfTodayJst(): Date {
  const jst = new Date(Date.now() + JST_OFFSET_MS);
  jst.setUTCHours(0, 0, 0, 0);
  return new Date(jst.getTime() - JST_OFFSET_MS);
}

/**
 * 一斉案内キャンペーンを作成（QUEUED）。実送信はcron(blast-send)が分割で行う。
 * 安全装置: confirm必須 / 同時1キャンペーン / 1日上限(blastDailyCap)。
 */
export async function POST(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const { talentIds, excludeContactIds, confirm } = (await req.json()) as {
      talentIds?: string[];
      excludeContactIds?: string[];
      confirm?: boolean;
    };

    if (!confirm) {
      return NextResponse.json({ error: "確認が必要です" }, { status: 400 });
    }
    if (!talentIds?.length) {
      return NextResponse.json({ error: "紹介する人材を1名以上選んでください" }, { status: 400 });
    }

    // 同時実行防止: 進行中キャンペーンがあれば拒否。
    const running = await prisma.blastCampaign.findFirst({
      where: { orgId: org.id, status: { in: ["QUEUED", "SENDING"] } },
      select: { id: true },
    });
    if (running) {
      return NextResponse.json(
        { error: "送信中のキャンペーンがあります。完了してから再実行してください" },
        { status: 409 },
      );
    }

    const talents = await prisma.talent.findMany({
      where: { id: { in: talentIds }, orgId: org.id },
      select: {
        id: true, name: true, emailBody: true, summaryText: true,
        mainSkills: true, skills: true, desiredRateMin: true, desiredRateMax: true, availabilityText: true,
      },
    });
    if (talents.length === 0) {
      return NextResponse.json({ error: "人材が見つかりません" }, { status: 404 });
    }

    const talentsBlock = joinTalentBlocks(talents.map((t) => buildTalentBlock(t)));
    const { subject, body } = (() => {
      const m = buildTalentIntroEmail({ talentsBlock });
      return { subject: m.subject, body: m.text };
    })();

    // 配信中の宛先（除外を差し引く）。
    const exclude = new Set(excludeContactIds ?? []);
    const contacts = await prisma.partnerContact.findMany({
      where: { orgId: org.id, status: "ACTIVE" },
      select: { id: true, email: true },
    });
    const recipients = contacts.filter((c) => !exclude.has(c.id));
    if (recipients.length === 0) {
      return NextResponse.json({ error: "送信先（配信中の連絡先）がありません" }, { status: 400 });
    }

    // 1日上限チェック（本日のSENT + 今回の宛先数）。
    const sentToday = await prisma.blastRecipient.count({
      where: {
        campaign: { orgId: org.id },
        status: "SENT",
        sentAt: { gte: startOfTodayJst() },
      },
    });
    if (sentToday + recipients.length > org.blastDailyCap) {
      return NextResponse.json(
        {
          error: `1日の送信上限(${org.blastDailyCap}通)を超えます（本日送信済み${sentToday}通 + 今回${recipients.length}通）。設定で上限を上げるか宛先を絞ってください`,
        },
        { status: 409 },
      );
    }

    // キャンペーン＋宛先行を作成（QUEUED）。
    const campaign = await prisma.$transaction(async (tx) => {
      const c = await tx.blastCampaign.create({
        data: {
          orgId: org.id,
          subject,
          body,
          talentIds: talents.map((t) => t.id),
          status: "QUEUED",
          totalCount: recipients.length,
        },
      });
      await tx.blastRecipient.createMany({
        data: recipients.map((r) => ({ campaignId: c.id, contactId: r.id, toAddr: r.email })),
        skipDuplicates: true,
      });
      return c;
    });

    return NextResponse.json({ ok: true, campaignId: campaign.id, recipientCount: recipients.length });
  } catch (err) {
    console.error("[POST /api/blast]", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
