import { describe, it, expect } from "vitest";
import { talentDedupeKey, projectDedupeKey, dedupeLatest } from "./dedupe";

describe("dedupe keys", () => {
  it("空白・大文字小文字・敬称を無視して同一キーになる（人材）", () => {
    expect(talentDedupeKey("山田 太郎", ["Java"])).toBe(
      talentDedupeKey("山田太郎さん", ["java"]),
    );
  });

  it("主要スキルが違えば別キー（人材）", () => {
    expect(talentDedupeKey("田中", ["Java"])).not.toBe(
      talentDedupeKey("田中", ["PHP"]),
    );
  });

  it("タイトル＋クライアントでキー化（案件）", () => {
    expect(projectDedupeKey("EC サイト改修", "A社")).toBe(
      projectDedupeKey("ECサイト改修", "a社"),
    );
    expect(projectDedupeKey("案件X", "A社")).not.toBe(
      projectDedupeKey("案件X", "B社"),
    );
  });
});

describe("dedupeLatest", () => {
  it("同一キーをまとめ、最新日付を代表にし件数を数える", () => {
    const items = [
      { id: "1", k: "a", d: "2026-06-01T00:00:00Z" },
      { id: "2", k: "a", d: "2026-06-05T00:00:00Z" }, // 最新
      { id: "3", k: "b", d: "2026-06-02T00:00:00Z" },
    ];
    const res = dedupeLatest(
      items,
      (i) => i.k,
      (i) => i.d,
    );
    expect(res).toHaveLength(2);
    const a = res.find((r) => r.item.k === "a")!;
    expect(a.item.id).toBe("2"); // 最新が代表
    expect(a.dupes).toBe(2);
    const b = res.find((r) => r.item.k === "b")!;
    expect(b.dupes).toBe(1);
  });

  it("日付が無い(null)場合も落ちない", () => {
    const res = dedupeLatest(
      [{ id: "1", k: "a", d: null }],
      (i) => i.k,
      (i) => i.d,
    );
    expect(res).toHaveLength(1);
    expect(res[0].item.id).toBe("1");
  });
});
