import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchJson } from "./http";

function mockFetch(ok: boolean, status: number, body: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status,
      text: async () => body,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchJson", () => {
  it("200＋JSON を返す", async () => {
    mockFetch(true, 200, JSON.stringify({ saved: 3 }));
    await expect(fetchJson("/x")).resolves.toEqual({ saved: 3 });
  });

  it("エラー応答の {error} をそのまま投げる", async () => {
    mockFetch(false, 500, JSON.stringify({ error: "DB落ちた" }));
    await expect(fetchJson("/x")).rejects.toThrow("DB落ちた");
  });

  it("504 はタイムアウト文言にする", async () => {
    mockFetch(false, 504, "An error occurred");
    await expect(fetchJson("/x")).rejects.toThrow(/タイムアウト/);
  });

  it("200 でも非JSON（クラッシュページ等）は解釈不能として投げる", async () => {
    mockFetch(true, 200, "An error occurred with this deployment");
    await expect(fetchJson("/x")).rejects.toThrow(/解釈できませんでした/);
  });

  it("error フィールドの無い非2xxは HTTP コード付きで投げる", async () => {
    mockFetch(false, 403, "");
    await expect(fetchJson("/x")).rejects.toThrow(/403/);
  });
});
