import { prisma } from "@/lib/prisma";
import { getAI } from "@/lib/ai";

// 差し戻しのたびに全件をLLM再要約するのは無駄なので、前回再生成からこの分数以内はスキップ
// （デバウンス）。連続差し戻し時のLLMコストを抑える。手動「今すぐ反映」は force で即時実行。
const DEBOUNCE_MS = (Number(process.env.MATCH_LEARNINGS_DEBOUNCE_MIN ?? "10") || 10) * 60 * 1000;

/**
 * 差し戻し(送らない判断)の履歴(MatchRejection)をLLMで分析し、
 * 「避けるべきマッチ傾向」を org.matchLearnings に保存（再生成）する。
 * 保存内容は match-run がマッチ判定プロンプトに自動付加し、該当マッチを提案不可/除外にする。
 * 差し戻しのたびに自動で呼ばれる（都度反映・ただしデバウンス）ほか、手動(force)でも実行できる。
 */
export async function regenerateMatchLearnings(
  orgId: string,
  opts?: { force?: boolean },
): Promise<{ ok: boolean; learnings?: string; count: number; error?: string; skipped?: boolean }> {
  // デバウンス: 直近に再生成済みなら、差し戻し連打でも毎回LLMを呼ばない（force時は無視）。
  // 差し戻しは履歴に追加済みで、次の非デバウンス実行（時間経過後 or 手動 or 日次）で必ず反映される。
  if (!opts?.force) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { matchLearningsAt: true },
    });
    const last = org?.matchLearningsAt;
    if (last && Date.now() - last.getTime() < DEBOUNCE_MS) {
      return { ok: false, count: 0, skipped: true, error: "前回再生成から間もないためスキップ（デバウンス）" };
    }
  }
  const rejections = await prisma.matchRejection.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { reason: true, projectTitle: true, talentName: true, score: true },
  });
  if (rejections.length === 0) {
    // 履歴が無くなったら学習も消す。
    await prisma.organization.update({
      where: { id: orgId },
      data: { matchLearnings: null, matchLearningsAt: null },
    });
    return { ok: false, count: 0, error: "差し戻しの記録がありません" };
  }
  const input = rejections
    .map((r, i) => {
      const score = r.score != null ? `${Math.round(r.score)}点` : "-";
      return `${i + 1}. 案件「${r.projectTitle ?? "?"}」 × 人材「${r.talentName ?? "?"}」（${score}）\n   理由: ${r.reason}`;
    })
    .join("\n");

  const learnings = (await getAI().analyzeRejections(input)).trim();
  await prisma.organization.update({
    where: { id: orgId },
    data: { matchLearnings: learnings || null, matchLearningsAt: new Date() },
  });
  return { ok: true, learnings, count: rejections.length };
}

/** 学習メモをクリア（マッチ判定への反映を止める）。 */
export async function clearMatchLearnings(orgId: string): Promise<void> {
  await prisma.organization.update({
    where: { id: orgId },
    data: { matchLearnings: null, matchLearningsAt: null },
  });
}
