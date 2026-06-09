// 商流（提案可否）の表示用ステータス。マッチ一覧・マッチング・見比べで共通利用する。
export type ChannelTone = "red" | "amber" | "green";

export interface ChannelStatus {
  label: string;
  tone: ChannelTone;
}

/**
 * proposable / channelNote から表示バッジを決める。
 * - 提案不可 → 赤「提案不可（商流）」
 * - 提案可だが「要確認/不明」 → 黄「商流 要確認」
 * - 提案可で根拠あり → 緑「商流OK」
 * - 判定情報なし（旧マッチ等）→ null（バッジを出さない）
 */
export function channelStatus(
  proposable: boolean,
  channelNote: string | null,
): ChannelStatus | null {
  if (!proposable) return { label: "提案不可（商流）", tone: "red" };
  if (!channelNote) return null;
  if (/要確認|不明/.test(channelNote)) return { label: "商流 要確認", tone: "amber" };
  return { label: "商流OK", tone: "green" };
}
