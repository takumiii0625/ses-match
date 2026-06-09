import { describe, it, expect, beforeEach, vi } from "vitest";

// 依存をモック（Gmail・DB・LLM・マッチ不要でページング制御を検証）。
const db = vi.hoisted(() => ({
  ingestedEmail: { findUnique: vi.fn(), create: vi.fn() },
  talent: { create: vi.fn() },
  project: { create: vi.fn() },
}));
const { fetchPage, classify, matchNew } = vi.hoisted(() => ({
  fetchPage: vi.fn(),
  classify: vi.fn(),
  matchNew: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/current-org", () => ({
  getCurrentOrg: async () => ({ id: "org1", classifyPrompt: null, talentPrompt: null, projectPrompt: null }),
}));
vi.mock("@/lib/ai", () => ({ getAI: () => ({ classifyEmail: classify }) }));
vi.mock("@/lib/match-run", () => ({ runMatchingForNew: matchNew }));
vi.mock("./gmail", () => ({ fetchEmailsPage: fetchPage, fetchEmails: vi.fn() }));

import { runMailIngestPage } from "./ingest-pipeline";

function mail(id: string) {
  return { messageId: id, gmailId: id, subject: "s", from: "a@x.com", to: "", text: "本文", date: new Date(), attachments: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.ingestedEmail.create.mockResolvedValue({});
  matchNew.mockResolvedValue({ pairs: 0, saved: 0 });
  classify.mockResolvedValue({ kind: "IGNORE", reason: "対象外" });
});

describe("runMailIngestPage — ページング制御", () => {
  it("ページ全件が既取込(skip)なら done=true（追いついた）", async () => {
    fetchPage.mockResolvedValue({ emails: [mail("a"), mail("b")], nextPageToken: "tok" });
    db.ingestedEmail.findUnique.mockResolvedValue({ id: "x" }); // 全て既取込

    const res = await runMailIngestPage(10);
    expect(res.skipped).toBe(2);
    expect(res.done).toBe(true); // nextPageToken があっても追いつき扱い
  });

  it("新規があり次ページもあれば done=false・nextPageToken を返す", async () => {
    fetchPage.mockResolvedValue({ emails: [mail("a"), mail("b")], nextPageToken: "tok2" });
    db.ingestedEmail.findUnique.mockResolvedValue(null); // 全て新規（IGNOREで登録）

    const res = await runMailIngestPage(10);
    expect(res.skipped).toBe(0);
    expect(res.ignored).toBe(2);
    expect(res.done).toBe(false);
    expect(res.nextPageToken).toBe("tok2");
  });

  it("次ページが無ければ done=true", async () => {
    fetchPage.mockResolvedValue({ emails: [mail("a")], nextPageToken: null });
    db.ingestedEmail.findUnique.mockResolvedValue(null);

    const res = await runMailIngestPage(10);
    expect(res.done).toBe(true);
  });

  it("取得ゼロなら done=true", async () => {
    fetchPage.mockResolvedValue({ emails: [], nextPageToken: null });
    const res = await runMailIngestPage(10);
    expect(res.fetched).toBe(0);
    expect(res.done).toBe(true);
  });
});
