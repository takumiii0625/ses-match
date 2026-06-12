import { NextResponse } from "next/server";
import { backfillEmailBodies } from "@/lib/email/backfill";
import { cronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 300;

async function handle(req: Request) {
  if (!(await cronAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? "200");
    const result = await backfillEmailBodies(Number.isFinite(limit) ? limit : 200);
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
