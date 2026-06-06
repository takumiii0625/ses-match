import { NextResponse } from "next/server";
import { runMailIngest } from "@/lib/email/ingest-pipeline";

export const maxDuration = 300;

// Fetch + ingest new mail. Used by both the manual "今すぐ取り込み" button and a
// scheduled Cron. If CRON_SECRET is set, requests must include it (header
// x-cron-secret or ?secret=). Same-origin manual calls are allowed when no
// secret is configured.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const url = new URL(req.url);
  const header = req.headers.get("x-cron-secret") ?? url.searchParams.get("secret");
  const auth = req.headers.get("authorization");
  return header === secret || auth === `Bearer ${secret}`;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const result = await runMailIngest(Number.isFinite(limit) ? limit : 20);
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
