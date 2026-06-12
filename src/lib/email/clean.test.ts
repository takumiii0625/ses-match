import { describe, it, expect } from "vitest";
import { cleanEmailText, emailBodyHash } from "./clean";

describe("cleanEmailText", () => {
  it("引用行（>）と引用ヘッダを除去", () => {
    const input = [
      "お世話になっております。",
      "下記案件です。",
      "",
      "2026年6月12日(金) 山田太郎 さんは書きました:",
      "> ■案件名：旧案件",
      "> 単価80万",
    ].join("\n");
    const out = cleanEmailText(input);
    expect(out).toContain("下記案件です。");
    expect(out).not.toContain("旧案件");
    expect(out).not.toContain("書きました");
  });

  it("末尾の免責・配信解除ブロックを除去", () => {
    const body = "■案件名：\n　Java開発\n■単価：\n　80万\n";
    const footer =
      "\n\n-----\n本メールおよび添付ファイルには機密情報が含まれています。\n配信停止をご希望の方はこちら。";
    const out = cleanEmailText(body + footer);
    expect(out).toContain("■案件名：");
    expect(out).toContain("80万");
    expect(out).not.toContain("機密情報");
    expect(out).not.toContain("配信停止");
  });

  it("免責マーカーの後に本文見出しが残る場合は削らない（安全側）", () => {
    // 本文先頭近くに「機密」が出るだけでは削られない（末尾30%のみ対象）
    const input =
      "■備考：\n　機密情報を扱う案件です。\n" + "■案件名：\n　金融系開発\n".repeat(10);
    const out = cleanEmailText(input);
    expect(out).toContain("機密情報を扱う案件です。");
  });

  it("連続空行を圧縮", () => {
    expect(cleanEmailText("a\n\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("emailBodyHash", () => {
  it("同一ドメイン×同一本文（空白差は無視）なら一致", () => {
    const a = emailBodyHash("astro-hd.com", "■案件名：\n　Java開発\n■単価：80万");
    const b = emailBodyHash("astro-hd.com", "■案件名： 　Java開発  ■単価：80万");
    expect(a).toBe(b);
  });

  it("本文が変われば（単価改定など）不一致", () => {
    const a = emailBodyHash("astro-hd.com", "■単価：80万");
    const b = emailBodyHash("astro-hd.com", "■単価：85万");
    expect(a).not.toBe(b);
  });

  it("ドメインが違えば不一致", () => {
    const a = emailBodyHash("astro-hd.com", "■単価：80万");
    const b = emailBodyHash("harumina.jp", "■単価：80万");
    expect(a).not.toBe(b);
  });
});
