import { NextResponse } from "next/server";
import { getCurrentOrg } from "@/lib/current-org";
import { regenerateMatchLearnings, clearMatchLearnings } from "@/lib/match-learnings";

export const maxDuration = 60;

/** 差し戻し履歴を分析して学習メモを再生成・保存（手動の「今すぐ反映」）。 */
export async function POST() {
  try {
    const org = await getCurrentOrg();
    const res = await regenerateMatchLearnings(org.id);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json(res);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** 学習メモをクリア（マッチ判定への反映を止める）。 */
export async function DELETE() {
  try {
    const org = await getCurrentOrg();
    await clearMatchLearnings(org.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
