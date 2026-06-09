import { describe, it, expect, beforeEach, vi } from "vitest";

// prisma / getCurrentOrg / getAI をモック（DB・LLM不要で再抽出ロジックを検証）。
const db = vi.hoisted(() => ({
  talent: { count: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  project: { count: vi.fn(), findMany: vi.fn(), update: vi.fn() },
}));
const { parseTalent, parseProject } = vi.hoisted(() => ({
  parseTalent: vi.fn(),
  parseProject: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/current-org", () => ({
  getCurrentOrg: async () => ({ id: "org1", talentPrompt: null, projectPrompt: null }),
}));
vi.mock("@/lib/ai", () => ({
  getAI: () => ({ parseTalentEmail: parseTalent, parseProjectEmail: parseProject }),
}));

import { reextractTalentFields, reextractProjectFields } from "./reextract";

beforeEach(() => {
  vi.clearAllMocks();
  db.talent.update.mockResolvedValue({});
  db.project.update.mockResolvedValue({});
});

describe("reextractProjectFields — 案件の商流再抽出", () => {
  it("商流未設定の案件だけ再抽出して補完、抽出済みは上書きしない", async () => {
    db.project.count.mockResolvedValue(2);
    db.project.findMany.mockResolvedValue([
      { id: "p1", emailSubject: "", emailFrom: "", emailBody: "本文", channelText: null },
      { id: "p2", emailSubject: "", emailFrom: "", emailBody: "本文", channelText: "1社先まで" },
    ]);
    parseProject.mockResolvedValue({ channelText: "エンド直のみ", supportFee: true });

    const res = await reextractProjectFields(0, 8);

    expect(parseProject).toHaveBeenCalledTimes(1); // p1のみ（p2は抽出済みでskip）
    expect(db.project.update).toHaveBeenCalledTimes(1);
    expect(db.project.update.mock.calls[0][0]).toMatchObject({
      where: { id: "p1" },
      data: { channelText: "エンド直のみ", supportFee: true },
    });
    expect(res).toMatchObject({ total: 2, processed: 2, done: true, updated: 1, skipped: 1 });
  });

  it("メールに商流記載がなければ更新しない（skip）", async () => {
    db.project.count.mockResolvedValue(1);
    db.project.findMany.mockResolvedValue([
      { id: "p1", emailSubject: "", emailFrom: "", emailBody: "本文", channelText: null },
    ]);
    parseProject.mockResolvedValue({ channelText: null, supportFee: false });

    const res = await reextractProjectFields(0, 8);

    expect(db.project.update).not.toHaveBeenCalled();
    expect(res).toMatchObject({ updated: 0, skipped: 1, done: true });
  });

  it("ページング: done=false で次offsetへ", async () => {
    db.project.count.mockResolvedValue(20);
    db.project.findMany.mockResolvedValue([
      { id: "p1", emailSubject: "", emailFrom: "", emailBody: "b", channelText: null },
    ]);
    parseProject.mockResolvedValue({ channelText: "1社先", supportFee: false });

    const res = await reextractProjectFields(0, 1);
    expect(res.processed).toBe(1);
    expect(res.done).toBe(false);
  });
});

describe("reextractTalentFields — 所属・性別の再抽出", () => {
  it("未設定のみ補完し、両方埋まっている人材はskip", async () => {
    db.talent.count.mockResolvedValue(2);
    db.talent.findMany.mockResolvedValue([
      { id: "t1", emailSubject: "", emailFrom: "", emailBody: "b", affiliation: null, gender: null },
      { id: "t2", emailSubject: "", emailFrom: "", emailBody: "b", affiliation: "自社", gender: "MALE" },
    ]);
    parseTalent.mockResolvedValue({ affiliation: "一社先フリーランス", gender: "FEMALE" });

    const res = await reextractTalentFields(0, 8);

    expect(parseTalent).toHaveBeenCalledTimes(1); // t1のみ
    expect(db.talent.update.mock.calls[0][0]).toMatchObject({
      where: { id: "t1" },
      data: { affiliation: "一社先フリーランス", gender: "FEMALE" },
    });
    expect(res).toMatchObject({ updated: 1, skipped: 1, done: true });
  });

  it("既存値は上書きしない（所属のみ未設定なら所属だけ補完）", async () => {
    db.talent.count.mockResolvedValue(1);
    db.talent.findMany.mockResolvedValue([
      { id: "t1", emailSubject: "", emailFrom: "", emailBody: "b", affiliation: null, gender: "MALE" },
    ]);
    parseTalent.mockResolvedValue({ affiliation: "二社先", gender: "FEMALE" });

    await reextractTalentFields(0, 8);

    expect(db.talent.update.mock.calls[0][0].data).toEqual({ affiliation: "二社先" });
  });
});
