import { describe, it, expect, beforeEach, vi } from "vitest";

// Prisma と AI をモック（DB・LLM不要でページング/クリーン再生成を検証）。
const db = vi.hoisted(() => ({
  project: { findMany: vi.fn() },
  talent: { findMany: vi.fn() },
  organization: { findUnique: vi.fn() },
  match: { deleteMany: vi.fn(), upsert: vi.fn() },
  ngCompany: { findMany: vi.fn() },
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
  db.ngCompany.findMany.mockResolvedValue([]); // 既定はNG企業なし
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

  it("貴社社員/貴社まで案件は他社人材を除外する（案件は残す・自社人材のみ候補）", async () => {
    db.project.findMany.mockResolvedValue([
      project("p1"),
      { ...project("p2"), channelText: "貴社まで" },
      { ...project("p3"), channelText: "貴社社員まで" },
    ]);
    // TALENTS は全員 PARTNER → 貴社まで案件は候補0でLLM呼び出しなし。
    const res = await runMatchingForOrg("org1", { offset: 0 });
    expect(res.totalProjects).toBe(3); // 案件は除外しない
    expect(rankMock).toHaveBeenCalledTimes(1); // p1のみ（他社も可）
    expect(res.saved).toBe(2); // p1 × t1,t2
  });

  it("貴社まで判定は表現ゆれ（貴社正社員まで/貴社プロパー/御社まで）も拾う", async () => {
    db.project.findMany.mockResolvedValue([
      { ...project("p1"), channelText: "貴社正社員まで" },
      { ...project("p2"), channelText: "貴社プロパー" },
      { ...project("p3"), channelText: "御社まで" },
    ]);
    // TALENTS は全員 PARTNER → 貴社止まり案件は候補0でLLM呼び出しなし（全件除外）。
    const res = await runMatchingForOrg("org1", { offset: 0 });
    expect(rankMock).not.toHaveBeenCalled();
    expect(res.saved).toBe(0);
  });

  it("「貴社の2社先まで」は貴社止まりではない（誤検知しない）", async () => {
    db.project.findMany.mockResolvedValue([
      { ...project("p1"), channelText: "貴社の2社先まで可" },
    ]);
    // 貴社止まりでない → 他社人材も候補に残る。
    const res = await runMatchingForOrg("org1", { offset: 0 });
    expect(rankMock).toHaveBeenCalledTimes(1);
    expect(res.saved).toBe(2); // t1,t2 とも候補
  });

  it("NG企業の他社人材は除外し、自社人材とNG以外の他社人材は残す", async () => {
    db.ngCompany.findMany.mockResolvedValue([{ domain: "ng.co.jp" }]);
    db.project.findMany.mockResolvedValue([{ ...project("p1"), sourceEmail: "x@client.co.jp" }]);
    db.talent.findMany.mockResolvedValue([
      { ...talent("t1"), sourceEmail: "a@ng.co.jp" }, // 他社・NG → 除外
      { ...talent("t2"), sourceEmail: "b@ok.co.jp" }, // 他社・OK → 残す
      { ...talent("t3"), talentType: "INHOUSE", sourceEmail: "c@ng.co.jp" }, // 自社・NGでも残す
    ]);
    const res = await runMatchingForOrg("org1", { offset: 0 });
    expect(res.saved).toBe(2); // t2, t3
  });

  it("NG企業の案件でもマッチ可（NG以外の他社人材＋自社人材）。NG企業の人材だけ除外", async () => {
    db.ngCompany.findMany.mockResolvedValue([{ domain: "ng.co.jp" }]);
    db.project.findMany.mockResolvedValue([{ ...project("p1"), sourceEmail: "x@ng.co.jp" }]);
    db.talent.findMany.mockResolvedValue([
      { ...talent("t1"), sourceEmail: "a@ok.co.jp" }, // 他社(NG以外) → マッチ可
      { ...talent("t2"), talentType: "INHOUSE", sourceEmail: null }, // 自社 → マッチ可
      { ...talent("t3"), sourceEmail: "c@ng.co.jp" }, // 他社(NG) → 除外
    ]);
    const res = await runMatchingForOrg("org1", { offset: 0 });
    expect(res.saved).toBe(2); // t1, t2（t3はNG企業の人材で除外）
  });

  it("貴社まで案件は貴社チェック付きの自社人材のみ候補", async () => {
    db.project.findMany.mockResolvedValue([{ ...project("p1"), channelText: "貴社まで" }]);
    db.talent.findMany.mockResolvedValue([
      { ...talent("t1"), talentType: "INHOUSE", kishaOk: true }, // 貴社チェックあり → 候補
      { ...talent("t2"), talentType: "INHOUSE", kishaOk: false }, // 貴社チェックなし → 除外
      talent("t3"), // PARTNER → 除外される
    ]);
    const res = await runMatchingForOrg("org1", { offset: 0 });
    expect(rankMock).toHaveBeenCalledTimes(1);
    expect(res.saved).toBe(1); // kishaOk付きの t1 のみ
  });

  it("貴社まで案件で貴社チェック付き人材がいなければLLM呼び出しなし", async () => {
    db.project.findMany.mockResolvedValue([{ ...project("p1"), channelText: "貴社まで" }]);
    db.talent.findMany.mockResolvedValue([
      { ...talent("t1"), talentType: "INHOUSE", kishaOk: false },
      talent("t2"), // PARTNER
    ]);
    const res = await runMatchingForOrg("org1", { offset: 0 });
    expect(rankMock).not.toHaveBeenCalled();
    expect(res.saved).toBe(0);
  });

  it("エンド直＋支援費なしは他社人材を除外（候補0でLLMなし）", async () => {
    db.project.findMany.mockResolvedValue([
      { ...project("p1"), channelText: "エンド直のみ", supportFee: false },
    ]);
    // TALENTS は全員 PARTNER。
    const res = await runMatchingForOrg("org1", { offset: 0 });
    expect(rankMock).not.toHaveBeenCalled();
    expect(res.saved).toBe(0);
    expect(res.totalProjects).toBe(1); // 案件自体は対象
  });

  it("エンド直でも支援費ありなら他社人材も候補に残す", async () => {
    db.project.findMany.mockResolvedValue([
      { ...project("p1"), channelText: "エンド直のみ", supportFee: true },
    ]);
    const res = await runMatchingForOrg("org1", { offset: 0 });
    expect(rankMock).toHaveBeenCalledTimes(1); // 他社 t1,t2 が候補
    expect(res.saved).toBe(2);
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
