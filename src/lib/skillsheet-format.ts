// スキルシートの抽出テキストを表示用に整形する。
// 古いデータは改行が失われ「塊」になっていることがあるため、表示時に
// 主要マーカー（■【◆・等）や文末「。」で改行を補って読みやすくする。
// 既に十分改行されているテキストはそのまま（崩さない）。

export function formatSkillSheetText(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw.replace(/\r\n?/g, "\n");

  // CSV/Excel由来の「空セル（カンマの羅列）」を掃除する。
  // 各行を「,」区切りのセルとみなし、空セルを除いて中身のある語だけを空白で連結。
  // 全セルが空の行（区切りだけの行）は空行になり、下で圧縮される。カンマ無しの行はそのまま。
  s = s
    .split("\n")
    .map((line) =>
      line.includes(",")
        ? line
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
            .join(" ")
        : line.trimEnd(),
    )
    .join("\n")
    .replace(/[ \t　]{2,}/g, " ") // 連続空白を1つに
    .replace(/\n{3,}/g, "\n\n"); // 空行の連続を1つに

  // 1行あたりの平均文字数。既に短ければ整形済みとみなしてそのまま返す。
  const nonEmptyLines = s.split("\n").filter((l) => l.trim()).length;
  const avg = s.replace(/\n/g, "").length / Math.max(1, nonEmptyLines);
  if (avg <= 50) return s.replace(/\n{3,}/g, "\n\n").trim();

  // 塊テキスト → 区切りの前後で改行を補う。
  s = s
    // セクション見出し・箇条書きマーカーの前で改行（行頭でなければ）
    .replace(/([^\n])([■【◆▼●〇○★◇□▪※])/g, "$1\n$2")
    // 中黒の箇条書きの前で改行
    .replace(/([^\n])・/g, "$1\n・")
    // 文末「。」の後ろで改行
    .replace(/。\s*(?=[^\n])/g, "。\n");

  return s.replace(/\n{3,}/g, "\n\n").trim();
}
