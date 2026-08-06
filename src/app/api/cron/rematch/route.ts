import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { runMatchingForOrg } from "@/lib/match-run";
import { cronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 300;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
// 増分マッチのウォーターマークが壊れ/未設定/古すぎる場合のフォールバック上限（2日）。
const REMATCH_MAX_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;

/** 今日(JST)0時のUTCエポックms（ウォーターマーク無し時のフォールバック）。 */
function startOfTodayJstMs(): number {
  const jst = new Date(Date.now() + JST_OFFSET_MS);
  jst.setUTCHours(0, 0, 0, 0);
  return jst.getTime() - JST_OFFSET_MS;
}

async function handle(req: Request) {
  if (!(await cronAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const org = await getCurrentOrg();
    // 分割実行: ?offset=&limit= で案件を小分けに処理（タイムアウト回避）。
    const url = new URL(req.url);
    const offset = Number(url.searchParams.get("offset") ?? "0") || 0;
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const scopeRaw = url.searchParams.get("scope");
    const scope =
      scopeRaw === "inhouse" ? "inhouse" : scopeRaw === "registered" ? "registered" : "all";

    // ?inc=1 = 定時の「増分マッチ」。取込は1日3回(11/15/17時)走り、その完了ごとに毎回発火する。
    // 前回rematch以降(ウォーターマーク=org.lastRematchDate にISO保存)に取り込んだ分だけを新規として
    // 判定し、判定済みペアはスキップする。これで「15時は新規メール＋11時の未マッチ分だけ」をLLMにかけ、
    // 11時に判定済みの案件×人材を再判定しない（取込のウォーターマークと同じ発想をマッチにも適用）。
    const inc = url.searchParams.get("inc") === "1";

    if (inc) {
      const sinceParam = url.searchParams.get("since");
      const markParam = url.searchParams.get("mark");
      const nowMs = Date.now();
      let sinceEpoch: number;
      let markEpoch: number;
      if (sinceParam && markParam) {
        // ページング中: 初回ページで確定した境界を引き継ぐ（全ページで同じ newSince を使う）。
        sinceEpoch = Number(sinceParam);
        markEpoch = Number(markParam);
      } else {
        // 初回ページ: 前回ウォーターマークを読み、古すぎ/未設定はクランプ／今日0時に。
        const prev = org.lastRematchDate ? Date.parse(org.lastRematchDate) : NaN;
        sinceEpoch = Number.isFinite(prev)
          ? Math.max(prev, nowMs - REMATCH_MAX_LOOKBACK_MS)
          : startOfTodayJstMs();
        markEpoch = nowMs; // この実行の開始時刻＝次回の新規境界。
      }

      const result = await runMatchingForOrg(org.id, {
        offset,
        limit,
        scope,
        skipExisting: true,
        newSince: new Date(sinceEpoch),
      });

      // 全件完了したらウォーターマークを前進（次回はこの時刻以降だけを新規扱いにする）。
      if (result.done) {
        await prisma.organization
          .update({
            where: { id: org.id },
            data: { lastRematchDate: new Date(markEpoch).toISOString() },
          })
          .catch(() => {});
      }
      console.log(
        `[rematch] inc since=${new Date(sinceEpoch).toISOString()} offset=${offset} processed=${result.processed}/${result.totalProjects} saved=${result.saved} done=${result.done}`,
      );
      // sinceEpoch/markEpoch を返し、ワークフローが後続ページに引き継ぐ。
      return NextResponse.json({ ...result, sinceEpoch, markEpoch });
    }

    // 手動フル再マッチ（?days=N・画面の全件マッチ）: プロンプト変更の反映やり直し等のため全件再評価。
    const daysRaw = url.searchParams.get("days");
    const sinceDays = daysRaw ? Number(daysRaw) : undefined;
    const result = await runMatchingForOrg(org.id, { offset, limit, scope, sinceDays });
    console.log(
      `[rematch] full days=${sinceDays ?? 1} offset=${offset} processed=${result.processed}/${result.totalProjects} saved=${result.saved} errors=${result.errors} done=${result.done}`,
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
