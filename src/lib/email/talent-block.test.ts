import { describe, it, expect } from "vitest";
import { buildTalentBlock, joinTalentBlocks } from "./talent-block";

describe("buildTalentBlock", () => {
  it("emailBodyを最優先", () => {
    expect(
      buildTalentBlock({ name: "T.A", emailBody: "本文です", summaryText: "要約" }),
    ).toBe("本文です");
  });
  it("emailBodyが無ければsummaryText", () => {
    expect(buildTalentBlock({ name: "T.A", summaryText: "要約テキスト" })).toBe("要約テキスト");
  });
  it("どちらも無ければ項目から組み立て", () => {
    const out = buildTalentBlock({
      name: "T.A",
      mainSkills: ["Java", "AWS"],
      desiredRateMin: 70,
      desiredRateMax: 85,
      availabilityText: "即日",
    });
    expect(out).toContain("【氏名】T.A");
    expect(out).toContain("Java / AWS");
    expect(out).toContain("70〜85万");
    expect(out).toContain("即日");
  });
});

describe("joinTalentBlocks", () => {
  it("区切り線で連結し空ブロックは除外", () => {
    const out = joinTalentBlocks(["A", "", "B"]);
    // 空ブロックは除外され、AとBが1本の区切り線で連結される。
    expect(out.split("\n").filter((l) => l === "A" || l === "B")).toEqual(["A", "B"]);
    expect(out).toMatch(/A\n─+\nB/);
  });
});
