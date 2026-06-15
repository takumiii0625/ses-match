import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { runMatchingForOrg } from "@/lib/match-run";
import { cronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 300;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** 今日(JST)の "YYYY-MM-DD"。1日1回ガードの判定キー。 */
function todayJstDate(): string {
  return new Date(Date.now() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

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
    // ?daily=1 は「定時スケジュール」からの呼び出し。スケジュールは取りこぼし対策で1日に
    // 複数回発火するため、1日1回だけ実マッチする冪等ガードを掛ける（手動実行には掛けない）。
    const daily = url.searchParams.get("daily") === "1";
    const today = todayJstDate();

    if (daily && offset === 0 && org.lastRematchDate === today) {
      console.log(`[rematch] daily skip: already ran today (${today})`);
      return NextResponse.json({
        skipped: true,
        reason: "already-ran-today",
        done: true,
        processed: 0,
        totalProjects: 0,
        saved: 0,
        errors: 0,
      });
    }

    const result = await runMatchingForOrg(org.id, { offset, limit, scope, sinceDays });

    // 完了したら本日分を記録（次の定時発火はスキップされる）。
    if (daily && result.done) {
      await prisma.organization
        .update({ where: { id: org.id }, data: { lastRematchDate: today } })
        .catch(() => {});
    }

    console.log(
      `[rematch] scope=${scope} days=${sinceDays ?? 1} daily=${daily} offset=${offset} processed=${result.processed}/${result.totalProjects} saved=${result.saved} errors=${result.errors} done=${result.done}`,
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
