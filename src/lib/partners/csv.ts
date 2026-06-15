import type { PartnerContactStatus } from "@prisma/client";

export interface BlastmailRow {
  errorCount: number;
  statusRaw: string; // 元の状態文字列
  status: PartnerContactStatus; // 正規化した配信状態
  name: string | null; // 「ご担当者」等。空/汎用名は null 扱いにしない（そのまま）
  company: string;
  email: string;
}

export interface CsvParseResult {
  rows: BlastmailRow[];
  errors: { line: number; reason: string }[];
}

/** BLASTMAILの状態 → 配信状態enum。配信中のみ送信対象(ACTIVE)。 */
export function mapStatus(raw: string): PartnerContactStatus {
  const s = raw.trim();
  if (s === "配信中") return "ACTIVE";
  if (s === "エラー停止") return "BOUNCED";
  // 「配信停止」「解除」など、それ以外は送信しない扱い。
  return "UNSUBSCRIBED";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * BLASTMAILのCSVバイト列をデコードする。
 * - UTF-8 BOM(EF BB BF) を除去
 * - まずUTF-8で試し、U+FFFD（置換文字）が混じる＝文字化けならSHIFT_JISで再デコード
 */
export function decodeCsv(bytes: Uint8Array): string {
  let buf = bytes;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    buf = buf.subarray(3);
  }
  const utf8 = new TextDecoder("utf-8").decode(buf);
  if (utf8.includes("�")) {
    try {
      return new TextDecoder("shift_jis").decode(buf);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

/** 引用符（"..."、""エスケープ）対応の最小CSV行パーサ。1行＝1レコード前提。 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const EXPECTED_HEADER = ["エラーカウント数", "状態", "氏名", "会社名", "E-Mail"];

/**
 * BLASTMAILエクスポートCSVをパースする。
 * 列: エラーカウント数, 状態, 氏名, 会社名, E-Mail
 * 不正な行（会社名/メール欠落、メール形式不正）は errors に積み、rows には含めない。
 */
export function parseBlastmailCsv(text: string): CsvParseResult {
  const rows: BlastmailRow[] = [];
  const errors: { line: number; reason: string }[] = [];

  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { rows, errors };

  // ヘッダ検証（順序・名称が一致するか。BOM除去済み前提）。
  const header = parseCsvLine(lines[0]);
  const headerOk = EXPECTED_HEADER.every((h, i) => (header[i] ?? "").replace(/^﻿/, "") === h);
  const start = headerOk ? 1 : 0; // ヘッダが無ければ全行データとして扱う

  for (let i = start; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length < 5) {
      errors.push({ line: i + 1, reason: "列数が不足しています" });
      continue;
    }
    const [errorCountStr, statusRaw, nameRaw, company, emailRaw] = cells;
    const email = (emailRaw ?? "").toLowerCase().trim();
    if (!company?.trim()) {
      errors.push({ line: i + 1, reason: "会社名が空です" });
      continue;
    }
    if (!email) {
      errors.push({ line: i + 1, reason: "メールアドレスが空です" });
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      errors.push({ line: i + 1, reason: `メール形式が不正です: ${email}` });
      continue;
    }
    const name = nameRaw?.trim() ? nameRaw.trim() : null;
    rows.push({
      errorCount: Number(errorCountStr) || 0,
      statusRaw: statusRaw?.trim() ?? "",
      status: mapStatus(statusRaw ?? ""),
      name,
      company: company.trim(),
      email,
    });
  }

  return { rows, errors };
}
