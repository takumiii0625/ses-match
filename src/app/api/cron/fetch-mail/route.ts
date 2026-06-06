import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { runMailIngest } from "@/lib/email/ingest-pipeline";

export const maxDuration = 300;

const authEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Fetch + ingest new mail. Authorized when EITHER:
//  - the request carries a valid CRON_SECRET (external/Vercel cron), OR
//  - it comes from a signed-in user (the manual "今すぐ取り込み" button).
// Local dev (no secret, no Clerk) is always allowed.
async function authorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const header =
      req.headers.get("x-cron-secret") ?? url.searchParams.get("secret");
    const authH = req.headers.get("authorization");
    if (header === secret || authH === `Bearer ${secret}`) return true;
  }
  if (authEnabled) {
    try {
      const { userId } = await auth();
      if (userId) return true;
    } catch {
      // Clerk not available — fall through
    }
  }
  // No secret configured and no auth layer → local/dev open access.
  return !secret && !authEnabled;
}

async function handle(req: Request) {
  if (!(await authorized(req))) {
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
