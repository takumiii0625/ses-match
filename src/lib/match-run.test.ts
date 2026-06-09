import { describe, it, expect, beforeEach, vi } from "vitest";

// Prisma と AI をモック（DB・LLM不要でページング/クリーン再生成を検証）。
const db = vi.hoisted(() => ({
  project: { findMany: vi.fn() },
  talent: { findMany: vi.fn() },
  organization: { findUnique: vi.fn() },
  match: { deleteMany: vi.fn(), upsert: vi.fn() },
}));
const { rankMock } = vi.hoisted(() => ({ rankMock: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/ai", () => ({ getAI: () => ({ rankCandidates: rankMock }) }));

import { runMatchingForOrg } from "./match-run";

// 必須スキルを空にすると prefilter は全候補を通すので、判定はモックに委ねられる。
function project(id: string) {
  return {
    id,
    title: `案件${id}`,
    clientName: null,
    requiredSkills: [],
    rateMin: null,
    rateMax: null,
    remotePreference: null,
    location: null,
    startText: null,
    description: null,
    channelText: null,
    supportFee: false,
    sourceEmail: null,
    receivedDate: new Date(),
  };
}
function talent(id: string) {
  return {
    id,
    name: `人材${id}`,
    age: null,
    talentType: "PARTNER",
    skills: [],
    mainSkills: [],
    desiredRateMin: null,
    desiredRateMax: null,
    remotePreference: null,
    availabilityText: null,
    nearestStation: null,
    note: null,
    sourceEmail: null,
    receivedDate: new Date(),
  };
}

const PROJECTS = [project("p1"), project("p2"), project("p3")];
const TALENTS = [talent("t1"), talent("t2")];

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findMany.mockResolvedValue(PROJECTS);
  db.talent.findMany.mockResolvedValue(TALENTS);
  db.organization.findUnique.mockResolvedValue({ matchPrompt: null });
  db.match.deleteMany.mockResolvedValue({ count: 0 });
  db.match.upsert.mockResolvedValue({});
  // 全候補を80点（>=MIN_SCORE）で提案可に。
  rankMock.mockImplementation(async (_proj: unknown, candidates: { talentId: string }[]) =>
    candidates.map((c) => ({
      talentId: c.talentId,
      score: 80,
      recommendation: "STRONG",
      strengths: ["合致"],
      concerns: [],
      reason: "ok",
      channelOk: true,
      channelNote: "",
    })),
  );
});

describe("runMatchingForOrg（ページング）", () => {
  it("先頭チャンク(offset=0)はクリーン再生成し、limit件だけ処理する", async () => {
    const res = await runMatchingForOrg("org1", { offset: 0, limit: 2 });

    expect(db.match.deleteMany).toHaveBeenCalledTimes(1); // クリーン再生成
    expect(rankMock).toHaveBeenCalledTimes(2); // 2案件ぶん
    expect(res.totalProjects).toBe(3);
    expect(res.processed).toBe(2);
    expect(res.done).toBe(false);
    expect(res.saved).toBe(4); // 2案件 × 2人材
    expect(db.match.upsert).toHaveBeenCalledTimes(4);
  });

  it("2チャンク目(offset>0)はクリーン再生成しない・残りを処理して done", async () => {
    const res = await runMatchingForOrg("org1", { offset: 2, limit: 2 });

    expect(db.match.deleteMany).not.toHaveBeenCalled();
    expect(rankMock).toHaveBeenCalledTimes(1); // 残り1案件
    expect(res.processed).toBe(3);
    expect(res.done).toBe(true);
    expect(res.saved).toBe(2);
  });

  it("MIN_SCORE未満は保存しない", async () => {
    rankMock.mockImplementation(async (_p: unknown, candidates: { talentId: string }[]) =>
      candidates.map((c) => ({
        talentId: c.talentId,
        score: 10, // < 50
        recommendation: "UNFIT",
        strengths: [],
        concerns: ["不一致"],
        reason: "low",
        channelOk: true,
        channelNote: "",
      })),
    );
    const res = await runMatchingForOrg("org1", { offset: 0, limit: 3 });
    expect(res.saved).toBe(0);
    expect(db.match.upsert).not.toHaveBeenCalled();
    expect(res.done).toBe(true);
  });

  it("商流『貴社社員/貴社まで』の案件はマッチング対象から除外する", async () => {
    db.project.findMany.mockResolvedValue([
      project("p1"),
      { ...project("p2"), channelText: "貴社まで" },
      { ...project("p3"), channelText: "貴社社員まで" },
    ]);
    const res = await runMatchingForOrg("org1", { offset: 0 });
    expect(res.totalProjects).toBe(1); // p1 のみ対象
    expect(rankMock).toHaveBeenCalledTimes(1);
  });

  it("提案不可(channelOk=false)も保存するが proposable=false で記録", async () => {
    rankMock.mockImplementation(async (_p: unknown, candidates: { talentId: string }[]) =>
      candidates.map((c) => ({
        talentId: c.talentId,
        score: 90,
        recommendation: "STRONG",
        strengths: [],
        concerns: [],
        reason: "ok",
        channelOk: false,
        channelNote: "エンド直のため提案不可",
      })),
    );
    await runMatchingForOrg("org1", { offset: 0, limit: 1 });
    const call = db.match.upsert.mock.calls[0][0];
    expect(call.create.proposable).toBe(false);
    expect(call.create.channelNote).toContain("提案不可");
  });
});
