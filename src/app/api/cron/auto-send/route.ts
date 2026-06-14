import { NextResponse } from "next/server";
import { getCurrentOrg } from "@/lib/current-org";
import { cronAuthorized } from "@/lib/cron-auth";
import { runAutoSendProjectInfo } from "@/lib/email/auto-send";

export const maxDuration = 300;

async function handle(req: Request) {
  if (!(await cronAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const org = await getCurrentOrg();
    const result = await runAutoSendProjectInfo(org.id);
    console.log(
      `[auto-send] enabled=${result.enabled} cap=${result.cap} sentTodayBefore=${result.sentTodayBefore} candidates=${result.candidates} sent=${result.sent} failed=${result.failed} skipped=${result.skipped} capReached=${result.capReached}`,
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
