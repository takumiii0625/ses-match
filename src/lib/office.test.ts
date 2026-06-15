import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { extractOfficeText, isOfficeFile } from "./office";

describe("isOfficeFile", () => {
  it("xlsx/xls/docx/docを判定", () => {
    expect(isOfficeFile("a.xlsx")).toBe(true);
    expect(isOfficeFile("a.xls")).toBe(true);
    expect(isOfficeFile("a.docx")).toBe(true);
    expect(isOfficeFile("a.pdf")).toBe(false);
    expect(isOfficeFile("a.txt")).toBe(false);
  });
});

describe("extractOfficeText", () => {
  it("xlsxの各シートをCSVテキストに抽出", async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["氏名", "スキル"],
      ["S.O", "React"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "人材");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const b64 = Buffer.from(buf).toString("base64");
    const text = await extractOfficeText("SO.xlsx", b64);
    expect(text).toContain("人材");
    expect(text).toContain("氏名,スキル");
    expect(text).toContain("S.O,React");
  });

  it("非対応形式(.doc等)は null", async () => {
    expect(await extractOfficeText("x.doc", "")).toBeNull();
    expect(await extractOfficeText("x.txt", "")).toBeNull();
  });
});
