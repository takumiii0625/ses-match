import { describe, it, expect } from "vitest";
import { createLimiter, mapLimit } from "./limit";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("createLimiter", () => {
  it("同時実行数が上限を超えない", async () => {
    const limit = createLimiter(2);
    let active = 0;
    let peak = 0;
    const task = () =>
      limit(async () => {
        active++;
        peak = Math.max(peak, active);
        await tick(10);
        active--;
      });
    await Promise.all(Array.from({ length: 6 }, task));
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("全タスクが完了し結果を返す", async () => {
    const limit = createLimiter(3);
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) => limit(async () => n * 2)),
    );
    expect(results).toEqual([2, 4, 6, 8]);
  });

  it("1タスクが失敗しても他に影響しない", async () => {
    const limit = createLimiter(2);
    const settled = await Promise.allSettled([
      limit(async () => {
        throw new Error("boom");
      }),
      limit(async () => "ok"),
    ]);
    expect(settled[0].status).toBe("rejected");
    expect(settled[1]).toMatchObject({ status: "fulfilled", value: "ok" });
  });
});

describe("mapLimit", () => {
  it("順序を保って結果を返す", async () => {
    const out = await mapLimit([1, 2, 3], 2, async (n) => n + 100);
    expect(out).toEqual([101, 102, 103]);
  });
});
