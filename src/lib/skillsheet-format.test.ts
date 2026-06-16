import { describe, it, expect } from "vitest";
import { formatSkillSheetText } from "./skillsheet-format";

describe("formatSkillSheetText", () => {
  it("既に改行されている短い行はそのまま（3行超の空行のみ圧縮）", () => {
    const t = "氏名: 田中\n年齢: 30\nスキル: Java";
    expect(formatSkillSheetText(t)).toBe(t);
  });

  it("塊テキストはマーカーの前で改行を補う", () => {
    const blob =
      "■職務経歴 大手SIerでJavaを5年担当しました。■スキル Java/Spring/SQL ■資格 基本情報技術者";
    const out = formatSkillSheetText(blob);
    expect(out).toBe(
      "■職務経歴 大手SIerでJavaを5年担当しました。\n■スキル Java/Spring/SQL \n■資格 基本情報技術者",
    );
  });

  it("中黒の箇条書きの前で改行する", () => {
    const blob =
      "保有スキルは次の通りで非常に幅広いです・Java・Python・TypeScript・Goなど多数あります・SQL";
    const out = formatSkillSheetText(blob);
    expect(out.split("\n").length).toBeGreaterThan(3);
    expect(out).toContain("\n・Java");
  });

  it("空・null は空文字", () => {
    expect(formatSkillSheetText("")).toBe("");
    expect(formatSkillSheetText(null)).toBe("");
    expect(formatSkillSheetText(undefined)).toBe("");
  });
});
