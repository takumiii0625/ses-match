import { timingSafeEqual } from "crypto";
import { auth } from "@clerk/nextjs/server";

const authEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/** タイミング攻撃を避けた秘密比較。長さが違っても比較時間が一定。 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // 長さ差で即returnするとタイミングで長さが漏れるため、ダミー比較を挟む
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/**
 * cronエンドポイントの認可（全 /api/cron/* で共通利用）。
 * 許可条件（いずれか）:
 * 1. `x-cron-secret` ヘッダ or `Authorization: Bearer` が CRON_SECRET と一致（GitHub Actions想定）
 * 2. Clerkでサインイン済みユーザー（画面からの手動実行想定）
 *
 * セキュリティ方針:
 * - クエリパラメータでの秘密受け取りは不可（URLがアクセスログに残るため）
 * - 比較はタイミングセーフ
 * - 本番（NODE_ENV=production）でCRON_SECRET未設定・Clerk無効の場合は常に拒否
 *   （ローカル開発のみ、両方未設定なら通す）
 */
export async function cronAuthorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("x-cron-secret");
    if (header && safeEqual(header, secret)) return true;
    const authH = req.headers.get("authorization");
    if (authH && safeEqual(authH, `Bearer ${secret}`)) return true;
  }
  if (authEnabled) {
    try {
      const { userId } = await auth();
      if (userId) return true;
    } catch {
      /* Clerk外からの呼び出し（cron等）は素通りさせて下のフォールバックへ */
    }
  }
  // どちらも未設定の場合はローカル開発のみ許可。本番では拒否。
  return !secret && !authEnabled && process.env.NODE_ENV !== "production";
}
