// prisma migrate deploy を一時的なDB接続失敗(P1001等)に対してリトライする。
// Neon等のサーバーレスDBはアイドルでサスペンドし、ビルド時の最初の接続が
// コールドスタートでタイムアウトすることがある。これでビルドが落ちないようにする。
import { execSync } from "node:child_process";

const MAX = 6;

function sleep(ms) {
  // 同期スリープ（依存追加なし・クロスプラットフォーム）。
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

for (let attempt = 1; attempt <= MAX; attempt++) {
  try {
    execSync("prisma migrate deploy", { stdio: "inherit" });
    process.exit(0);
  } catch {
    if (attempt === MAX) {
      console.error(`prisma migrate deploy が ${MAX} 回失敗しました（DBに到達できません）。`);
      process.exit(1);
    }
    const wait = 4000 + attempt * 1000; // 5s,6s,7s,8s,9s
    console.error(
      `prisma migrate deploy 失敗 (試行 ${attempt}/${MAX})。${wait / 1000}秒後に再試行…`,
    );
    sleep(wait);
  }
}
