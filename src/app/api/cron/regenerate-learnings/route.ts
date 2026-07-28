import { NextResponse } from "next/server";
import { getCurrentOrg } from "@/lib/current-org";
import { regenerateMatchLearnings } from "@/lib/match-learnings";
import { cronAuthorized } from "@/lib/cron-auth";

// 複数エージェント分析は数回のLLM呼び出しになるため、余裕を持たせる。
export const maxDuration = 300;

/**
 * 差し戻し履歴を「今すぐ」再分析し、学習メモ(org.matchLearnings)を再生成する。
 * 画面の「今すぐ再分析して反映」と同じ処理を、cron_secret でも起動できるようにしたもの
 * （GitHub Actions / 手動 dispatch から即時実行するため）。force=true でデバウンス無視。
 */
async function handle(req: Request) {
  if (!(await cronAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const org = await getCurrentOrg();
    const res = await regenerateMatchLearnings(org.id, { force: true });
    console.log(
      `[regenerate-learnings] ok=${res.ok} count=${res.count}${res.error ? ` error=${res.error}` : ""}`,
    );
    return NextResponse.json(res);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
