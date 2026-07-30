import { describe, it, expect } from "vitest";
import { normalizeManYen } from "./anthropic";

describe("normalizeManYen — 単価を万円単位に正規化", () => {
  it("円の生値(1000以上)は1/10000して万円に補正", () => {
    expect(normalizeManYen(500000)).toBe(50); // 「50万円まで」を500000で抽出した誤り
    expect(normalizeManYen(800000)).toBe(80);
    expect(normalizeManYen(1200000)).toBe(120);
    expect(normalizeManYen(650000)).toBe(65);
  });
  it("正常な万円値(3桁以内)はそのまま", () => {
    expect(normalizeManYen(50)).toBe(50);
    expect(normalizeManYen(80)).toBe(80);
    expect(normalizeManYen(120)).toBe(120);
  });
  it("null/未定義/非数はnull", () => {
    expect(normalizeManYen(null)).toBeNull();
    expect(normalizeManYen(undefined)).toBeNull();
    expect(normalizeManYen(NaN)).toBeNull();
  });
});
