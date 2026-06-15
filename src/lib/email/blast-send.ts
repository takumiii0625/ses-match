import { prisma } from "@/lib/prisma";
import { sendBatchMail, UNSUBSCRIBE_PLACEHOLDER } from "@/lib/email/send";

const APP_URL = (process.env.APP_URL ?? "https://sesmatch.encore-biz.com").replace(/\/$/, "");

export interface DrainResult {
  campaignId: string | null;
  sent: number;
  failed: number;
  skipped: number;
  remaining: number;
  done: boolean;
}

/** 人間が押す配信停止ページ（確認UI付き）。本文フッターに載せる。 */
function unsubPageUrl(token: string): string {
  return `${APP_URL}/unsubscribe/${token}`;
}
/** メールクライアントのワンクリック停止用エンドポイント（List-Unsubscribe-Post）。 */
function unsubApiUrl(token: string): string {
  return `${APP_URL}/api/unsubscribe/${token}`;
}

/**
 * QUEUED/SENDING のキャンペーンを1件、PENDING宛先を batchSize ずつ Resend batch で送る。
 * - maxToSend に達したら中断（次回のcronで続き）。冪等（PENDINGのみ処理＋idempotencyKey）。
 * - 送信直前に連絡先の状態を再確認し、ACTIVE以外は SKIPPED（途中の配信停止を尊重）。
 */
export async function drainBlast(
  orgId: string,
  opts: { batchSize?: number; maxToSend?: number } = {},
): Promise<DrainResult> {
  const batchSize = Math.min(opts.batchSize ?? 100, 100); // Resend batch上限100
  const maxToSend = opts.maxToSend ?? 500;

  const campaign = await prisma.blastCampaign.findFirst({
    where: { orgId, status: { in: ["QUEUED", "SENDING"] } },
    orderBy: { createdAt: "asc" },
  });
  if (!campaign) {
    return { campaignId: null, sent: 0, failed: 0, skipped: 0, remaining: 0, done: true };
  }

  if (campaign.status === "QUEUED") {
    await prisma.blastCampaign.update({
      where: { id: campaign.id },
      data: { status: "SENDING", startedAt: campaign.startedAt ?? new Date() },
    });
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  while (sent + failed < maxToSend) {
    const batch = await prisma.blastRecipient.findMany({
      where: { campaignId: campaign.id, status: "PENDING" },
      orderBy: { id: "asc" },
      take: batchSize,
    });
    if (batch.length === 0) break;

    // 送信直前に連絡先の状態・トークンを確認。
    const contactIds = batch.map((r) => r.contactId);
    const contacts = await prisma.partnerContact.findMany({
      where: { id: { in: contactIds } },
      select: { id: true, email: true, status: true, unsubscribeToken: true },
    });
    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    const sendable: { recipientId: string; to: string; token: string }[] = [];
    const skipIds: string[] = [];
    for (const r of batch) {
      const c = contactMap.get(r.contactId);
      if (!c || c.status !== "ACTIVE") {
        skipIds.push(r.id);
      } else {
        sendable.push({ recipientId: r.id, to: c.email, token: c.unsubscribeToken });
      }
    }

    // 配信停止/削除済みは SKIPPED に。
    if (skipIds.length > 0) {
      await prisma.blastRecipient.updateMany({
        where: { id: { in: skipIds } },
        data: { status: "SKIPPED" },
      });
      skipped += skipIds.length;
    }

    if (sendable.length > 0) {
      const items = sendable.map((s) => ({
        to: s.to,
        subject: campaign.subject,
        text: campaign.body.split(UNSUBSCRIBE_PLACEHOLDER).join(unsubPageUrl(s.token)),
        headers: {
          "List-Unsubscribe": `<${unsubApiUrl(s.token)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }));
      // idempotencyKey はバッチ先頭の recipientId で安定化（再実行で二重送信しない）。
      const idemKey = `${campaign.id}:${sendable[0].recipientId}`;
      try {
        await sendBatchMail(items, idemKey);
        await prisma.blastRecipient.updateMany({
          where: { id: { in: sendable.map((s) => s.recipientId) } },
          data: { status: "SENT", sentAt: new Date() },
        });
        sent += sendable.length;
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
        await prisma.blastRecipient.updateMany({
          where: { id: { in: sendable.map((s) => s.recipientId) } },
          data: { status: "FAILED", error: msg },
        });
        failed += sendable.length;
      }
    }
  }

  // 集計をキャンペーンに反映。
  const remaining = await prisma.blastRecipient.count({
    where: { campaignId: campaign.id, status: "PENDING" },
  });
  const agg = await prisma.blastRecipient.groupBy({
    by: ["status"],
    where: { campaignId: campaign.id },
    _count: { _all: true },
  });
  const count = (s: string) => agg.find((g) => g.status === s)?._count._all ?? 0;
  const done = remaining === 0;
  await prisma.blastCampaign.update({
    where: { id: campaign.id },
    data: {
      sentCount: count("SENT"),
      failedCount: count("FAILED"),
      status: done ? "DONE" : "SENDING",
      finishedAt: done ? new Date() : null,
    },
  });

  return { campaignId: campaign.id, sent, failed, skipped, remaining, done };
}
