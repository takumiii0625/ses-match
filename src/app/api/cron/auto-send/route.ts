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
    // ?cap=N で当回だけ上限を上書き（cap=0 は無制限）。手動の一括送信用。
    const url = new URL(req.url);
    const capRaw = url.searchParams.get("cap");
    const capOverride = capRaw !== null && capRaw !== "" ? Number(capRaw) : undefined;
    const maxRaw = url.searchParams.get("maxPerRun");
    const maxPerRun = maxRaw ? Number(maxRaw) : undefined;
    const result = await runAutoSendProjectInfo(org.id, {
      capOverride: Number.isFinite(capOverride) ? capOverride : undefined,
      maxPerRun: Number.isFinite(maxPerRun) ? maxPerRun : undefined,
    });
    console.log(
      `[auto-send] enabled=${result.enabled} cap=${result.cap} sentTodayBefore=${result.sentTodayBefore} candidates=${result.candidates} sent=${result.sent} failed=${result.failed} skipped=${result.skipped} remaining=${result.remaining} done=${result.done} capReached=${result.capReached}`,
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
