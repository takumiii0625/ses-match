import { NextResponse } from "next/server";
import { runMailIngest, runMailIngestPage } from "@/lib/email/ingest-pipeline";
import { cronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 300;

async function handle(req: Request) {
  if (!(await cronAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    // ?days=N で取得期間を直近N日に広げ、取りこぼし（cron停止時など）を回収できる。
    const daysRaw = Number(url.searchParams.get("days"));
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : undefined;
    // ページ方式（推奨・タイムアウトしない）: ?pageToken=... &pageSize=12
    // pageSize が指定された場合はページ方式、無ければ従来の一括 limit 方式。
    const pageSizeRaw = url.searchParams.get("pageSize");
    if (pageSizeRaw !== null) {
      const pageSize = Number(pageSizeRaw) || 12;
      const pageToken = url.searchParams.get("pageToken") ?? undefined;
      // ?after=<epoch秒> でウォーターマークを後続ページへ引き継ぐ（未指定の1ページ目で自動算出）。
      const afterRaw = url.searchParams.get("after");
      const afterParam = afterRaw === null ? undefined : Number(afterRaw) || 0;
      const result = await runMailIngestPage(pageSize, pageToken, days, afterParam);
      return NextResponse.json(result);
    }
    const limit = Number(url.searchParams.get("limit") ?? "200");
    const result = await runMailIngest(Number.isFinite(limit) ? limit : 200, days);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handle(req);
}

// Vercel Cron uses GET.
export async function GET(req: Request) {
  return handle(req);
}
