// メール本文・備考・抽出テキストから「スキルシートのリンク」（スプレッドシート/ドライブ/
// Office ファイル）を拾う純関数。スキルシートがPDFではなくリンクで来るケースに対応。

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;

/** URL がスプレッドシート/ドライブ/Officeファイルのリンクか。 */
export function isSheetLink(u: string): boolean {
  return (
    /docs\.google\.com\/spreadsheets/i.test(u) ||
    /drive\.google\.com/i.test(u) ||
    /\.(xlsx?|csv)(\?|#|$)/i.test(u) ||
    /sharepoint\.com|1drv\.ms|onedrive\.live\.com/i.test(u) ||
    /spreadsheets?/i.test(u)
  );
}

/** 複数テキストからスキルシートらしきリンクを重複なく抽出する。 */
export function extractSheetLinks(...texts: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of texts) {
    if (!t) continue;
    const urls = t.match(URL_RE) ?? [];
    for (let u of urls) {
      u = u.replace(/[.,)\]、。）」』】＞>]+$/, ""); // 末尾の句読点・閉じ括弧を除去
      if (isSheetLink(u) && !seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
  }
  return out;
}
