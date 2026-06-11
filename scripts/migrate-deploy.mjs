// prisma migrate deploy を実行する。Neon等のサーバーレスDBはアイドルでサスペンドし、
// ビルド時にDBへ到達できない（P1001）ことがある。その場合に毎回ビルドを落とすと、
// 一時的なDB不通でデプロイ全体が止まってしまう。
//
// 方針:
//  - 数回リトライ（コールドスタートの起床を待つ）。
//  - それでも「接続エラー(P1001等)」なら、migrate をスキップしてビルドを続行する
//    （スキーマ未適用のリスクはあるが、実行時はDB復旧後に正常化。接続復旧後に
//     改めて migrate deploy を流せばよい）。
//  - 「接続以外のエラー（実際のマイグレーション失敗）」なら、ビルドを中止する。
import { execSync } from "node:child_process";

const MAX = 5;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runOnce() {
  // 2>&1 で stderr も取り込み、成否に関わらず出力を得る（Vercelビルドは Linux/sh）。
  try {
    const out = execSync("prisma migrate deploy 2>&1", { encoding: "utf8" });
    process.stdout.write(out);
    return { ok: true, out };
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    process.stdout.write(out);
    return { ok: false, out };
  }
}

const CONNECTION_ERROR =
  /P1001|P1002|P1008|P1017|Can't reach database|Timed out|ECONNREFUSED|ETIMEDOUT/i;

let last = "";
for (let attempt = 1; attempt <= MAX; attempt++) {
  const r = runOnce();
  if (r.ok) process.exit(0);
  last = r.out;
  if (attempt < MAX) {
    const wait = 4000 + attempt * 1000; // 5s,6s,7s,8s
    console.error(`prisma migrate deploy 失敗 (試行 ${attempt}/${MAX})。${wait / 1000}秒後に再試行…`);
    sleep(wait);
  }
}

if (CONNECTION_ERROR.test(last)) {
  console.error(
    "⚠ DBに接続できないため migrate deploy をスキップしてビルドを続行します。" +
      "DB復旧後に `pnpm exec prisma migrate deploy` を実行してください。",
  );
  process.exit(0); // 接続不能 → デプロイは通す
}

console.error("prisma migrate deploy が失敗しました（接続以外のエラー）。ビルドを中止します。");
process.exit(1); // 実マイグレーションエラー → 失敗させる
