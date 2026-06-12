import { createHash } from "crypto";

/**
 * LLMに渡す前のメール本文クリーニング。DB保存の原文（emailBody）はそのまま、
 * LLM入力だけを軽くする（トークン削減＋抽出ノイズ減）。
 * - 引用ブロック（行頭 > ）と直前の引用ヘッダ（「〜wrote:」「〜さんは書きました」）を除去
 * - 末尾の免責・配信解除ブロックを除去（誤って本文を削らないよう末尾30%のみ・■【見出しが残らない場合のみ）
 * - 連続空行を圧縮
 */
export function cleanEmailText(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 引用行
    if (/^\s*>/.test(line)) continue;
    // 引用ヘッダ行（次の非空行が引用なら、この行も引用の一部とみなして落とす）
    if (/(wrote:|書きました[:：]?)\s*$/.test(line.trim())) {
      const next = lines.slice(i + 1).find((l) => l.trim() !== "");
      if (next && /^\s*>/.test(next)) continue;
    }
    kept.push(line);
  }
  let result = kept.join("\n");

  // 末尾の免責・配信解除ブロック除去。
  // マーカーは免責文に特有の言い回しに限定（「機密情報を扱う案件」等の本文記述は対象外）。
  // 安全条件: マーカーが本文の30%より後 かつ マーカー以降に見出し（■【）が無い場合のみ切る。
  const FOOTER_MARKER =
    /配信(の)?(停止|解除)|unsubscribe|本メール(および|及び|や)?(の)?添付|機密情報(が|を)含(まれ|み|む)|confidential/i;
  const m = result.search(FOOTER_MARKER);
  if (m >= 0 && m >= result.length * 0.3 && !/[■【]/.test(result.slice(m))) {
    // マーカー行の行頭まで戻して切り、直前に残った区切り線・空行も落とす
    const head = result.slice(0, m);
    const lastNl = head.lastIndexOf("\n");
    result = (lastNl >= 0 ? head.slice(0, lastNl) : "").replace(
      /(\n[-=ー─━_*＊\s]*)+$/,
      "",
    );
  }

  return result.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 再送メール検出用ハッシュ。送信元ドメイン＋正規化本文（クリーニング・空白圧縮後）のSHA-256。
 * 同じ会社が同じ本文を再送した場合に一致する。単価改定など本文が変われば一致しない。
 */
export function emailBodyHash(fromDomain: string | null, text: string): string {
  const normalized = cleanEmailText(text).replace(/\s+/g, " ").trim();
  return createHash("sha256")
    .update(`${fromDomain ?? ""}#${normalized}`)
    .digest("hex");
}
