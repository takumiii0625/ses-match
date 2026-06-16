import { describe, it, expect } from "vitest";
import { normalizeNgDomain } from "./ng-company";

describe("normalizeNgDomain", () => {
  it("メール/ドメイン/URL をドメインに正規化する", () => {
    expect(normalizeNgDomain("a@example.co.jp")).toBe("example.co.jp");
    expect(normalizeNgDomain("Example.co.jp")).toBe("example.co.jp");
    expect(normalizeNgDomain("https://www.example.co.jp/path")).toBe("example.co.jp");
    expect(normalizeNgDomain("  www.example.com  ")).toBe("example.com");
  });

  it("フリーメール・空・不正は null", () => {
    expect(normalizeNgDomain("a@gmail.com")).toBeNull();
    expect(normalizeNgDomain("")).toBeNull();
    expect(normalizeNgDomain("   ")).toBeNull();
    expect(normalizeNgDomain("notadomain")).toBeNull(); // ドット無し
  });
});
