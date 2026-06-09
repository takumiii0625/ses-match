import { describe, it, expect } from "vitest";
import { formatRate, formatAge, daysAgo } from "./utils";

describe("formatRate", () => {
  it("レンジ・下限のみ・上限のみ・未指定を整形", () => {
    expect(formatRate(60, 80)).toBe("60〜80万");
    expect(formatRate(80, null)).toBe("80万〜");
    expect(formatRate(null, 80)).toBe("〜80万");
    expect(formatRate(null, null)).toBe("-");
  });
});

describe("formatAge", () => {
  it("年齢または -", () => {
    expect(formatAge(30)).toBe("30");
    expect(formatAge(null)).toBe("-");
  });
});

describe("daysAgo", () => {
  const DAY = 86400000;
  it("今日 / 1日前 / N日前", () => {
    expect(daysAgo(new Date())).toBe("今日");
    expect(daysAgo(new Date(Date.now() - DAY))).toBe("1日前");
    expect(daysAgo(new Date(Date.now() - 5 * DAY))).toBe("5日前");
  });
  it("null は -", () => {
    expect(daysAgo(null)).toBe("-");
  });
  it("ISO文字列も受け付ける", () => {
    expect(daysAgo(new Date(Date.now() - 3 * DAY).toISOString())).toBe("3日前");
  });
});
