import { describe, it, expect, beforeEach, vi } from "vitest";

// prisma と project-mail をモックして自動送信の制御ロジックを検証。
const db = vi.hoisted(() => ({
  organization: { findUnique: vi.fn() },
  sentEmail: { count: vi.fn(), findMany: vi.fn() },
  match: { findMany: vi.fn() },
}));
const { prepare, sendLog } = vi.hoisted(() => ({
  prepare: vi.fn(),
  sendLog: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/email/project-mail", () => ({
  prepareProjectInfoMail: prepare,
  sendAndLogProjectInfo: sendLog,
}));

import { runAutoSendProjectInfo } from "./auto-send";

const okMail = (to: string) => ({
  ok: true as const,
  mail: { to, subject: "件名", text: "本文", lastSentAt: null },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.sentEmail.count.mockResolvedValue(0);
  db.sentEmail.findMany.mockResolvedValue([]);
  db.match.findMany.mockResolvedValue([]);
  sendLog.mockResolvedValue({ id: "re_x" });
  prepare.mockImplementation(async (o: { talentId: string }) => okMail(`${o.talentId}@x.com`));
});

describe("runAutoSendProjectInfo", () => {
  it("OFFなら何もしない", async () => {
    db.organization.findUnique.mockResolvedValue({ autoEmailEnabled: false, autoEmailDailyCap: 20, projectEmailPrompt: null });
    const r = await runAutoSendProjectInfo("org1");
    expect(r.enabled).toBe(false);
    expect(r.sent).toBe(0);
    expect(db.match.findMany).not.toHaveBeenCalled();
    expect(sendLog).not.toHaveBeenCalled();
  });

  it("ONなら未送信の対象を送信する", async () => {
    db.organization.findUnique.mockResolvedValue({ autoEmailEnabled: true, autoEmailDailyCap: 20, projectEmailPrompt: null });
    db.match.findMany.mockResolvedValue([
      { talentId: "t1", projectId: "p1" },
      { talentId: "t2", projectId: "p1" },
    ]);
    const r = await runAutoSendProjectInfo("org1");
    expect(r.enabled).toBe(true);
    expect(r.candidates).toBe(2);
    expect(r.sent).toBe(2);
    expect(sendLog).toHaveBeenCalledTimes(2);
  });

  it("既送信ペアは除外する", async () => {
    db.organization.findUnique.mockResolvedValue({ autoEmailEnabled: true, autoEmailDailyCap: 20, projectEmailPrompt: null });
    db.match.findMany.mockResolvedValue([
      { talentId: "t1", projectId: "p1" },
      { talentId: "t2", projectId: "p1" },
    ]);
    db.sentEmail.findMany.mockResolvedValue([{ talentId: "t1", projectId: "p1" }]);
    const r = await runAutoSendProjectInfo("org1");
    expect(r.candidates).toBe(1); // t1#p1 は除外
    expect(r.sent).toBe(1);
  });

  it("同一ペアの重複マッチは1回だけ送る", async () => {
    db.organization.findUnique.mockResolvedValue({ autoEmailEnabled: true, autoEmailDailyCap: 20, projectEmailPrompt: null });
    db.match.findMany.mockResolvedValue([
      { talentId: "t1", projectId: "p1" },
      { talentId: "t1", projectId: "p1" },
    ]);
    const r = await runAutoSendProjectInfo("org1");
    expect(r.candidates).toBe(1);
    expect(r.sent).toBe(1);
  });

  it("1日の上限を超えたら停止（手動送信分も計上）", async () => {
    db.organization.findUnique.mockResolvedValue({ autoEmailEnabled: true, autoEmailDailyCap: 3, projectEmailPrompt: null });
    db.sentEmail.count.mockResolvedValue(2); // 本日すでに2通送信済み → 残り1通
    db.match.findMany.mockResolvedValue([
      { talentId: "t1", projectId: "p1" },
      { talentId: "t2", projectId: "p2" },
      { talentId: "t3", projectId: "p3" },
    ]);
    const r = await runAutoSendProjectInfo("org1");
    expect(r.sent).toBe(1); // 残り1通だけ送る
    expect(r.capReached).toBe(true);
  });

  it("上限に既達なら1通も送らない", async () => {
    db.organization.findUnique.mockResolvedValue({ autoEmailEnabled: true, autoEmailDailyCap: 5, projectEmailPrompt: null });
    db.sentEmail.count.mockResolvedValue(5);
    const r = await runAutoSendProjectInfo("org1");
    expect(r.capReached).toBe(true);
    expect(r.sent).toBe(0);
    expect(db.match.findMany).not.toHaveBeenCalled();
  });

  it("送信先不明（prepare ok:false）はスキップ", async () => {
    db.organization.findUnique.mockResolvedValue({ autoEmailEnabled: true, autoEmailDailyCap: 20, projectEmailPrompt: null });
    db.match.findMany.mockResolvedValue([{ talentId: "t1", projectId: "p1" }]);
    prepare.mockResolvedValue({ ok: false, status: 400, error: "送信先不明" });
    const r = await runAutoSendProjectInfo("org1");
    expect(r.sent).toBe(0);
    expect(r.skipped).toBe(1);
    expect(sendLog).not.toHaveBeenCalled();
  });
});
