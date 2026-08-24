import { NextResponse } from "next/server";
import { getCurrentOrg } from "@/lib/current-org";
import { regenerateMatchLearnings, previewNewRejections } from "@/lib/match-learnings";
import { cronAuthorized } from "@/lib/cron-auth";

// 複数エージェント分析は数回のLLM呼び出しになるため、余裕を持たせる。
export const maxDuration = 300;

/**
 * 差し戻し履歴を再分析する。
 * - 既定: 直近200件を分析し学習メモ(org.matchLearnings)を再生成・保存（今すぐ反映）。force=true。
 * - ?preview=1: まだ取り込んでいない差し戻し（前回反映以降の新規）だけを分析し、保存せず結果だけ返す
 *   （取り込むか人が判断するための下見）。
 */
async function handle(req: Request) {
  if (!(await cronAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const org = await getCurrentOrg();
    const preview = new URL(req.url).searchParams.get("preview") === "1";
    if (preview) {
      const res = await previewNewRejections(org.id);
      console.log(
        `[regenerate-learnings] preview ok=${res.ok} count=${res.count} since=${res.since ?? "-"}${res.error ? ` error=${res.error}` : ""}`,
      );
      return NextResponse.json({ ...res, preview: true });
    }
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
