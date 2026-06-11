import { PrismaClient, Prisma } from "@prisma/client";

// 一時的な接続エラーのコード。Neon等のサーバーレスDBはアイドルで自動サスペンドし、
// 復帰時やコールドスタート時に短時間「届かない」ことがある。これらは接続自体が
// 確立していない＝クエリは未実行なので、再試行しても安全（書き込みも重複しない）。
const TRANSIENT_CODES = new Set([
  "P1001", // Can't reach database server
  "P1002", // Database server reached but timed out
  "P1008", // Operations timed out
  "P1017", // Server has closed the connection
  "P2024", // Timed out fetching a connection from the pool
]);

function isTransient(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return TRANSIENT_CODES.has(e.code);
  }
  // 初期化時の接続不能（P1001 等）は Initialization error として来ることもある。
  return e instanceof Prisma.PrismaClientInitializationError;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  // 再試行の待ち時間（ms）。Neon等のコンピュート起床は数秒かかるため、
  // 合計で十分長く待つ（初回失敗後に起床→次の試行で成功させる）。
  const BACKOFFS = [1000, 2000, 4000, 6000, 8000]; // 計約21秒・最大6試行
  return base.$extends({
    query: {
      async $allOperations({ args, query }) {
        let lastErr: unknown;
        for (let attempt = 0; attempt <= BACKOFFS.length; attempt++) {
          try {
            return await query(args);
          } catch (e) {
            lastErr = e;
            if (!isTransient(e) || attempt === BACKOFFS.length) throw e;
            await sleep(BACKOFFS[attempt]);
          }
        }
        throw lastErr;
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof makeClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
