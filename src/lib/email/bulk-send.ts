import { mapLimit } from "@/lib/limit";

// 1リクエストで送る上限（タイムアウト・誤爆防止）。これを超える選択は分割して送る。
export const BULK_MAX_PAIRS = 100;
// 同時送信数（Resend へのバースト抑制）。
const BULK_CONCURRENCY = 3;

export interface Pair {
  talentId: string;
  projectId: string;
  // 任意: 画面で編集した送信内容（指定時はサーバ生成より優先して送る）。
  subject?: string;
  text?: string;
}
export type BulkStatus = "sent" | "skipped" | "failed";
export interface PairResult extends Pair {
  status: BulkStatus;
  to?: string;
  reason?: string;
}
export interface BulkSummary {
  sent: number;
  skipped: number;
  failed: number;
  results: PairResult[];
}

/** 不正な値・重複ペアを除いて正規化する。 */
export function normalizePairs(raw: unknown): Pair[] {
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const pairs: Pair[] = [];
  for (const p of arr) {
    if (!p || typeof p.talentId !== "string" || typeof p.projectId !== "string") continue;
    const key = `${p.talentId}:${p.projectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pair: Pair = { talentId: p.talentId, projectId: p.projectId };
    if (typeof p.subject === "string" && p.subject.trim()) pair.subject = p.subject;
    if (typeof p.text === "string" && p.text.trim()) pair.text = p.text;
    pairs.push(pair);
  }
  return pairs;
}

/**
 * 複数ペアを限定並列で送信し、件数サマリを返す。perPair は1ペアを送って結果を返す。
 * perPair が throw した場合は failed として扱う（全体は止めない）。
 */
export async function runBulkSend(
  pairs: Pair[],
  perPair: (pair: Pair) => Promise<PairResult>,
): Promise<BulkSummary> {
  const results = await mapLimit(pairs, BULK_CONCURRENCY, async (pair) => {
    try {
      return await perPair(pair);
    } catch (e) {
      return { ...pair, status: "failed" as const, reason: e instanceof Error ? e.message : String(e) };
    }
  });
  return {
    sent: results.filter((r) => r.status === "sent").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}
