import { describe, it, expect } from "vitest";
import { afterEpochFrom } from "./ingest-pipeline";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// 既定: overlap=180分(3h), maxLookback=2日。
const now = Date.UTC(2026, 5, 23, 8, 0, 0); // 固定の現在時刻

describe("afterEpochFrom（取込ウォーターマーク→after:epoch）", () => {
  it("取込履歴が無ければ undefined（初回は既定窓にフォールバック）", () => {
    expect(afterEpochFrom(null, now)).toBeUndefined();
  });

  it("最近の取込なら『最終受信−3hのoverlap』を秒で返す", () => {
    const last = new Date(now - 30 * 60 * 1000); // 30分前
    const got = afterEpochFrom(last, now);
    expect(got).toBe(Math.floor((last.getTime() - 3 * HOUR) / 1000));
  });

  it("ウォーターマークが古すぎても now-2日 までしか遡らない（暴走スキャン防止）", () => {
    const last = new Date(now - 5 * DAY); // 5日前
    const got = afterEpochFrom(last, now);
    expect(got).toBe(Math.floor((now - 2 * DAY) / 1000));
  });

  it("返すのは秒（ミリ秒ではない）", () => {
    const last = new Date(now - HOUR);
    const got = afterEpochFrom(last, now)!;
    // 秒なので now(ms) よりはるかに小さい桁
    expect(got).toBeLessThan(now);
    expect(Number.isInteger(got)).toBe(true);
  });
});
