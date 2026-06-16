import { describe, it, expect } from "vitest";
import { extractSheetLinks, isSheetLink } from "./sheet-links";

describe("isSheetLink", () => {
  it("スプレッドシート/ドライブ/Officeを判定", () => {
    expect(isSheetLink("https://docs.google.com/spreadsheets/d/abc/edit")).toBe(true);
    expect(isSheetLink("https://drive.google.com/file/d/xyz/view")).toBe(true);
    expect(isSheetLink("https://example.com/skill.xlsx")).toBe(true);
    expect(isSheetLink("https://example.com/list.csv?dl=1")).toBe(true);
    expect(isSheetLink("https://contoso.sharepoint.com/x")).toBe(true);
    expect(isSheetLink("https://example.com/top")).toBe(false);
  });
});

describe("extractSheetLinks", () => {
  it("本文からシートリンクだけを重複なく抽出", () => {
    const body =
      "スキルシートはこちら https://docs.google.com/spreadsheets/d/abc/edit です。\n" +
      "会社HP https://example.com/about も参照。\n" +
      "再掲: https://docs.google.com/spreadsheets/d/abc/edit";
    expect(extractSheetLinks(body)).toEqual([
      "https://docs.google.com/spreadsheets/d/abc/edit",
    ]);
  });

  it("末尾の句読点・括弧を除去する", () => {
    expect(extractSheetLinks("シート（https://example.com/a.xlsx）。")).toEqual([
      "https://example.com/a.xlsx",
    ]);
  });

  it("該当が無ければ空配列", () => {
    expect(extractSheetLinks("普通のメールです https://example.com/news", null)).toEqual([]);
  });
});
