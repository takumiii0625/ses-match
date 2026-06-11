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
  return base.$extends({
    query: {
      async $allOperations({ args, query }) {
        let lastErr: unknown;
        // 最大3回（初回＋2回再試行）。コールドスタートの復帰を吸収する。
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            return await query(args);
          } catch (e) {
            lastErr = e;
            if (!isTransient(e) || attempt === 2) throw e;
            await sleep(200 * (attempt + 1)); // 200ms, 400ms
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
