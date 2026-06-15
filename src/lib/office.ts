import * as XLSX from "xlsx";
import mammoth from "mammoth";

/**
 * Office系ファイル（Excel/Word）のbase64からテキストを抽出する（サーバ専用）。
 * - .xlsx / .xls: 各シートをCSV化して連結（SheetJS）
 * - .docx: 本文テキスト（mammoth）
 * - .doc（旧バイナリWord）等は非対応 → null
 */
export async function extractOfficeText(
  filename: string,
  base64: string,
): Promise<string | null> {
  try {
    const buf = Buffer.from(base64, "base64");
    if (/\.xlsx?$/i.test(filename)) {
      const wb = XLSX.read(buf, { type: "buffer" });
      const parts = wb.SheetNames.map((name) => {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]).trim();
        return csv ? `【シート: ${name}】\n${csv}` : "";
      }).filter(Boolean);
      const text = parts.join("\n\n").trim();
      return text || null;
    }
    if (/\.docx$/i.test(filename)) {
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return value?.trim() || null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Office系の拡張子か（テキスト抽出対象か）。 */
export function isOfficeFile(filename: string): boolean {
  return /\.(xlsx?|docx?)$/i.test(filename);
}
