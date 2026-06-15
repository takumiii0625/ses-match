import { describe, it, expect, beforeEach, vi } from "vitest";

// prisma と sendBatchMail をモックしてドレイン制御を検証。
const db = vi.hoisted(() => ({
  blastCampaign: { findFirst: vi.fn(), update: vi.fn() },
  blastRecipient: { findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  partnerContact: { findMany: vi.fn() },
}));
const { sendBatch } = vi.hoisted(() => ({ sendBatch: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/email/send", () => ({
  sendBatchMail: sendBatch,
  UNSUBSCRIBE_PLACEHOLDER: "{{UNSUBSCRIBE_URL}}",
}));

import { drainBlast } from "./blast-send";

beforeEach(() => {
  vi.clearAllMocks();
  db.blastCampaign.update.mockResolvedValue({});
  db.blastRecipient.updateMany.mockResolvedValue({});
  db.blastRecipient.count.mockResolvedValue(0);
  db.blastRecipient.groupBy.mockResolvedValue([
    { status: "SENT", _count: { _all: 0 } },
  ]);
  sendBatch.mockResolvedValue({ ids: [] });
});

describe("drainBlast", () => {
  it("送信待ちが無ければ done=true で何もしない", async () => {
    db.blastCampaign.findFirst.mockResolvedValue(null);
    const r = await drainBlast("org1");
    expect(r.done).toBe(true);
    expect(r.campaignId).toBeNull();
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("PENDING宛先をbatchで送り、ACTIVE以外はSKIP", async () => {
    db.blastCampaign.findFirst.mockResolvedValue({
      id: "c1", status: "QUEUED", subject: "件名", body: "本文 {{UNSUBSCRIBE_URL}}", startedAt: null,
    });
    // 1回目: 2件PENDING（1件はUNSUBSCRIBEDでSKIP）、2回目: 空
    db.blastRecipient.findMany
      .mockResolvedValueOnce([
        { id: "r1", contactId: "ct1", status: "PENDING" },
        { id: "r2", contactId: "ct2", status: "PENDING" },
      ])
      .mockResolvedValueOnce([]);
    db.partnerContact.findMany.mockResolvedValue([
      { id: "ct1", email: "a@a.com", status: "ACTIVE", unsubscribeToken: "tok1" },
      { id: "ct2", email: "b@b.com", status: "UNSUBSCRIBED", unsubscribeToken: "tok2" },
    ]);
    db.blastRecipient.count.mockResolvedValue(0);
    db.blastRecipient.groupBy.mockResolvedValue([{ status: "SENT", _count: { _all: 1 } }]);

    const r = await drainBlast("org1", { batchSize: 100 });

    expect(sendBatch).toHaveBeenCalledTimes(1);
    // 送信対象は ACTIVE の ct1 のみ
    const [items, idemKey] = sendBatch.mock.calls[0];
    expect(items).toHaveLength(1);
    expect(items[0].to).toBe("a@a.com");
    expect(items[0].text).toContain("/unsubscribe/tok1"); // プレースホルダ置換
    expect(items[0].headers["List-Unsubscribe"]).toContain("tok1");
    expect(idemKey).toBe("c1:r1");
    expect(r.sent).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.done).toBe(true);
  });

  it("送信が失敗したらFAILEDに記録", async () => {
    db.blastCampaign.findFirst.mockResolvedValue({
      id: "c1", status: "SENDING", subject: "S", body: "B {{UNSUBSCRIBE_URL}}", startedAt: new Date(0),
    });
    db.blastRecipient.findMany
      .mockResolvedValueOnce([{ id: "r1", contactId: "ct1", status: "PENDING" }])
      .mockResolvedValueOnce([]);
    db.partnerContact.findMany.mockResolvedValue([
      { id: "ct1", email: "a@a.com", status: "ACTIVE", unsubscribeToken: "tok1" },
    ]);
    sendBatch.mockRejectedValue(new Error("Resend down"));
    db.blastRecipient.groupBy.mockResolvedValue([{ status: "FAILED", _count: { _all: 1 } }]);

    const r = await drainBlast("org1");
    expect(r.failed).toBe(1);
    // FAILED更新が呼ばれている
    const failCall = db.blastRecipient.updateMany.mock.calls.find(
      (c) => c[0].data?.status === "FAILED",
    );
    expect(failCall).toBeTruthy();
  });

  it("maxToSendに達したら中断（remaining>0でdone=false）", async () => {
    db.blastCampaign.findFirst.mockResolvedValue({
      id: "c1", status: "SENDING", subject: "S", body: "B", startedAt: new Date(0),
    });
    db.blastRecipient.findMany.mockResolvedValue([{ id: "r1", contactId: "ct1", status: "PENDING" }]);
    db.partnerContact.findMany.mockResolvedValue([
      { id: "ct1", email: "a@a.com", status: "ACTIVE", unsubscribeToken: "tok1" },
    ]);
    db.blastRecipient.count.mockResolvedValue(5); // まだ残っている
    db.blastRecipient.groupBy.mockResolvedValue([{ status: "SENT", _count: { _all: 1 } }]);

    const r = await drainBlast("org1", { maxToSend: 1 });
    expect(r.sent).toBe(1);
    expect(r.remaining).toBe(5);
    expect(r.done).toBe(false);
  });
});
