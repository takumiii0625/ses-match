import { describe, it, expect, beforeEach, vi } from "vitest";

// 依存をモック（Gmail・DB・LLM・マッチ不要でページング制御を検証）。
const db = vi.hoisted(() => ({
  ingestedEmail: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
  talent: { create: vi.fn() },
  project: { create: vi.fn() },
}));
const { listIds, fetchById, classify, matchNew } = vi.hoisted(() => ({
  listIds: vi.fn(),
  fetchById: vi.fn(),
  classify: vi.fn(),
  matchNew: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/current-org", () => ({
  getCurrentOrg: async () => ({ id: "org1", classifyPrompt: null, talentPrompt: null, projectPrompt: null }),
}));
vi.mock("@/lib/ai", () => ({ getAI: () => ({ classifyEmail: classify }) }));
vi.mock("@/lib/match-run", () => ({ runMatchingForNew: matchNew }));
vi.mock("./gmail", () => ({
  listMessageIds: listIds,
  fetchEmailById: fetchById,
  fetchEmailByIdLight: fetchById,
  extractAttachmentsFor: vi.fn().mockResolvedValue([]),
  fetchEmails: vi.fn(),
}));

import { runMailIngestPage } from "./ingest-pipeline";

function mail(id: string) {
  return { messageId: id, gmailId: id, subject: "s", from: "a@x.com", to: "", text: "本文", date: new Date(), attachments: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.ingestedEmail.create.mockResolvedValue({});
  db.ingestedEmail.findUnique.mockResolvedValue(null); // messageId 重複は無し（既取込は gmailId で事前除外）
  db.ingestedEmail.findFirst.mockResolvedValue(null); // 再送（同一本文）も無し
  db.ingestedEmail.findMany.mockResolvedValue([]);
  db.ingestedEmail.aggregate.mockResolvedValue({ _max: { receivedAt: null } }); // ウォーターマーク無し→既定窓
  matchNew.mockResolvedValue({ pairs: 0, saved: 0 });
  classify.mockResolvedValue({ kind: "IGNORE", reason: "対象外" });
  fetchById.mockImplementation(async (id: string) => mail(id));
});

describe("runMailIngestPage — ページング制御（ID事前除外）", () => {
  it("既取込(gmailId)は本文取得せず重複として集計、新規だけ fetch", async () => {
    listIds.mockResolvedValue({ ids: ["a", "b", "c"], nextPageToken: "tok" });
    db.ingestedEmail.findMany.mockResolvedValue([{ gmailId: "a" }, { gmailId: "b" }]);

    const res = await runMailIngestPage(10);

    expect(fetchById).toHaveBeenCalledTimes(1); // 新規 c のみ本文取得
    expect(fetchById).toHaveBeenCalledWith("c");
    expect(res.fetched).toBe(3);
    expect(res.skipped).toBe(2);
  });

  it("全件重複でも次ページがあれば done=false（古い未取込に到達するため辿り続ける）", async () => {
    listIds.mockResolvedValue({ ids: ["a", "b"], nextPageToken: "tok" });
    db.ingestedEmail.findMany.mockResolvedValue([{ gmailId: "a" }, { gmailId: "b" }]);

    const res = await runMailIngestPage(10);

    expect(fetchById).not.toHaveBeenCalled();
    expect(res.skipped).toBe(2);
    expect(res.done).toBe(false); // ← 旧実装はここで止まっていた
    expect(res.nextPageToken).toBe("tok");
  });

  it("次ページが無ければ done=true", async () => {
    listIds.mockResolvedValue({ ids: ["a"], nextPageToken: null });
    const res = await runMailIngestPage(10);
    expect(res.done).toBe(true);
    expect(res.ignored).toBe(1);
  });

  it("取得ゼロなら done=true・DB照会もしない", async () => {
    listIds.mockResolvedValue({ ids: [], nextPageToken: null });
    const res = await runMailIngestPage(10);
    expect(res.fetched).toBe(0);
    expect(res.done).toBe(true);
    expect(db.ingestedEmail.findMany).not.toHaveBeenCalled();
  });

  it("再送メール（同一本文ハッシュが3日内に存在）はLLMを呼ばずDUPLICATEで記録", async () => {
    listIds.mockResolvedValue({ ids: ["a"], nextPageToken: null });
    db.ingestedEmail.findFirst.mockResolvedValue({ id: "prev", kind: "PROJECT" });

    const res = await runMailIngestPage(10);

    expect(classify).not.toHaveBeenCalled(); // LLM未実行
    expect(res.skipped).toBe(1);
    expect(db.ingestedEmail.create).toHaveBeenCalledTimes(1);
    expect(db.ingestedEmail.create.mock.calls[0][0].data).toMatchObject({
      kind: "DUPLICATE",
    });
    expect(db.ingestedEmail.create.mock.calls[0][0].data.bodyHash).toBeTruthy();
  });
});
