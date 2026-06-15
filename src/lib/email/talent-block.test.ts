import { describe, it, expect } from "vitest";
import { buildTalentBlock, buildTalentIntroBlock, joinTalentBlocks } from "./talent-block";

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

describe("buildTalentIntroBlock（一斉案内・本人固有のみ）", () => {
  it("emailBodyは使わず、氏名見出し＋summaryTextを出す", () => {
    const out = buildTalentIntroBlock({
      name: "Y.S",
      emailBody: "別の人Aさん・Bさんを含む複数人のメール本文",
      summaryText: "Y.Sのスキルシート要約",
    });
    expect(out).toContain("■ Y.S");
    expect(out).toContain("Y.Sのスキルシート要約");
    expect(out).not.toContain("別の人");
  });
  it("summaryTextが無ければ氏名＋構造化項目（本人固有）", () => {
    const out = buildTalentIntroBlock({
      name: "T.A",
      emailBody: "他人の本文",
      mainSkills: ["SAP", "ABAP"],
      desiredRateMin: 80,
      desiredRateMax: 90,
      availabilityText: "即日",
    });
    expect(out).toContain("■ T.A");
    expect(out).toContain("SAP / ABAP");
    expect(out).toContain("80〜90万");
    expect(out).not.toContain("他人の本文");
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
