import { NextResponse } from "next/server";
import { getCurrentOrg } from "@/lib/current-org";
import { runMatchingForOrg } from "@/lib/match-run";
import { cronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 300;

async function handle(req: Request) {
  if (!(await cronAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const org = await getCurrentOrg();
    // 分割実行: ?offset=&limit= で案件を小分けに処理（タイムアウト回避）。
    // パラメータ無し（クロン）は従来どおり全件処理。
    const url = new URL(req.url);
    const offset = Number(url.searchParams.get("offset") ?? "0") || 0;
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const scope = url.searchParams.get("scope") === "inhouse" ? "inhouse" : "all";
    // ?days=N で対象期間を指定（1=今日のみ・既定。過去のマッチ復旧時に 3 等を指定）。
    const daysRaw = url.searchParams.get("days");
    const sinceDays = daysRaw ? Number(daysRaw) : undefined;
    const result = await runMatchingForOrg(org.id, { offset, limit, scope, sinceDays });
    console.log(
      `[rematch] scope=${scope} days=${sinceDays ?? 1} offset=${offset} processed=${result.processed}/${result.totalProjects} saved=${result.saved} errors=${result.errors} done=${result.done}`,
    );
    return NextResponse.json(result);
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
