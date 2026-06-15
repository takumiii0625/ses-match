import { NextResponse } from "next/server";
import { getCurrentOrg } from "@/lib/current-org";
import { cronAuthorized } from "@/lib/cron-auth";
import { drainBlast } from "@/lib/email/blast-send";

export const maxDuration = 300;

async function handle(req: Request) {
  if (!(await cronAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const org = await getCurrentOrg();
    const url = new URL(req.url);
    const maxToSend = Number(url.searchParams.get("maxToSend") ?? "") || 500;
    const result = await drainBlast(org.id, { batchSize: 100, maxToSend });
    console.log(
      `[blast-send] campaign=${result.campaignId} sent=${result.sent} failed=${result.failed} skipped=${result.skipped} remaining=${result.remaining} done=${result.done}`,
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
