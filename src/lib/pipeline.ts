// 営業パイプラインの段階定義（提案管理画面のチェック・APIで共通利用）。
// メール送信済（SentEmail由来）は自動表示、以下5段階は手動チェック。
export const PIPELINE_STAGES = [
  { key: "stTalent", label: "人材提案" },
  { key: "stAccept", label: "承諾" },
  { key: "stClient", label: "案件側提案" },
  { key: "stInterview", label: "面談" },
  { key: "stClosed", label: "成約" },
] as const;

export type StageKey = (typeof PIPELINE_STAGES)[number]["key"];

export const STAGE_KEYS: StageKey[] = PIPELINE_STAGES.map((s) => s.key);

export function isStageKey(v: unknown): v is StageKey {
  return typeof v === "string" && (STAGE_KEYS as string[]).includes(v);
}
