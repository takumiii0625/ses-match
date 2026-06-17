// HTMLメール本文 → プレーンテキスト変換（行構造を保持・色付き等の中身を失わない）。
// 重い依存（googleapis 等）を持たない純関数のモジュール。テスト容易。

/** HTMLエンティティ（&amp; &#39; &#x27; 等）を文字へ復元する。 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, d) => {
      try {
        return String.fromCodePoint(Number(d));
      } catch {
        return "";
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      try {
        return String.fromCodePoint(parseInt(h, 16));
      } catch {
        return "";
      }
    })
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

/**
 * HTMLメール本文をプレーンテキストへ変換する（行構造を保持）。
 * <br> や </p></div></li></tr> 等の「行の区切り」を改行に変換してからタグを除去するので、
 * 色付き・ハイライト等のリッチHTML（spanだらけ）でも改行と中身のテキストを失わない。
 */
export function htmlToText(html: string): string {
  if (!html) return "";
  let s = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // <a href="URL">テキスト</a> は URL を本文に残す（スキルシートのリンク等を失わない）。
    // 後段の一括タグ除去で href が消えるため、ここで「テキスト URL」に展開しておく。
    .replace(
      /<a\b[^>]*?href=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href: string, inner: string) => {
        const txt = inner.replace(/<[^>]+>/g, "").trim();
        if (!href || /^(mailto:|tel:|#|javascript:)/i.test(href)) return txt;
        return txt && txt !== href ? `${txt} ${href}` : href;
      },
    );
  // 行区切りになる要素を改行へ。<br> と「閉じタグ」だけを改行にする
  // （開きタグも改行にすると </div><div> で二重改行になり間延びするため閉じ側のみ）。
  s = s
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|tr|h[1-6]|table|ul|ol|blockquote|section|article)\s*>/gi, "\n")
    // 残りのタグ（span/font/b/a 等）は除去＝中のテキスト（色付き語）は残す。
    .replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  // 空白の正規化（行内の連続空白だけ詰め、改行は保持）。
  s = s
    .replace(/\u00a0/g, " ") // ノーブレークスペース → 半角スペース
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s;
}

/**
 * プレーン本文とHTML由来本文から、情報量の多い方を採用する。
 * - HTMLのみ／プレーンが空・URLだけのメール（リッチHTML）→ HTML由来を採用。
 * - 通常のプレーン主体メール → プレーンを採用（HTMLは署名/フッタで膨らみがちなので軽率に切替えない）。
 */
export function pickRicherBody(plain: string, htmlText: string): string {
  const p = plain.trim();
  const h = htmlText.trim();
  if (!p) return h;
  if (!h) return p;
  if (p.length < 40 || h.length > p.length * 1.2) return h;
  return p;
}
