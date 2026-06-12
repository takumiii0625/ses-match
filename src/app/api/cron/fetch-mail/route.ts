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
    // ページ方式（推奨・タイムアウトしない）: ?pageToken=... &pageSize=12
    // pageSize が指定された場合はページ方式、無ければ従来の一括 limit 方式。
    const pageSizeRaw = url.searchParams.get("pageSize");
    if (pageSizeRaw !== null) {
      const pageSize = Number(pageSizeRaw) || 12;
      const pageToken = url.searchParams.get("pageToken") ?? undefined;
      const result = await runMailIngestPage(pageSize, pageToken);
      return NextResponse.json(result);
    }
    const limit = Number(url.searchParams.get("limit") ?? "200");
    const result = await runMailIngest(Number.isFinite(limit) ? limit : 200);
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
