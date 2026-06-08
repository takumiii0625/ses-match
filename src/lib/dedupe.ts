// 同じ案件/人材が複数メールで届く重複を1つにまとめるためのキーとユーティリティ。
// 方針: 名前・タイトルで自動グループ化し、最新の配信を代表にする。

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[様さん]+$/u, "")
    .trim();
}

/** 人材の重複キー: 氏名(イニシャル) + 主要スキル代表1つ。 */
export function talentDedupeKey(name: string, mainSkills: string[]): string {
  return `${norm(name)}#${norm(mainSkills[0])}`;
}

/** 案件の重複キー: タイトル + クライアント。 */
export function projectDedupeKey(title: string, clientName: string | null): string {
  return `${norm(title)}#${norm(clientName)}`;
}

function toMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export interface DedupedItem<T> {
  item: T; // 代表（最新配信）
  dupes: number; // 同一グループの件数（1=重複なし）
}

/**
 * keyOf が同じものをまとめ、dateOf が最新のものを代表にする。
 * 戻り値は代表のみ（各代表に同一件数 dupes を付与）。順序は入力の初出順。
 */
export function dedupeLatest<T>(
  items: T[],
  keyOf: (t: T) => string,
  dateOf: (t: T) => string | null | undefined,
): DedupedItem<T>[] {
  const map = new Map<string, { item: T; dupes: number; ms: number }>();
  for (const it of items) {
    const k = keyOf(it);
    const ms = toMs(dateOf(it));
    const cur = map.get(k);
    if (!cur) {
      map.set(k, { item: it, dupes: 1, ms });
    } else {
      cur.dupes++;
      if (ms > cur.ms) {
        cur.item = it;
        cur.ms = ms;
      }
    }
  }
  return [...map.values()].map((v) => ({ item: v.item, dupes: v.dupes }));
}
