import { NextResponse } from "next/server";
import { reextractProjectFields } from "@/lib/email/reextract";
import { cronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 300;

async function handle(req: Request) {
  if (!(await cronAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const offset = Number(url.searchParams.get("offset") ?? "0") || 0;
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : 8;
    const result = await reextractProjectFields(offset, Number.isFinite(limit) ? limit : 8);
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
