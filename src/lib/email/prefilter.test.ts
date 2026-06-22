import { describe, it, expect } from "vitest";
import { prefilterEmail } from "./prefilter";

const base = { from: "営業 <sales@partner.co.jp>", subject: "ご紹介", text: "Javaエンジニアのご紹介です。稼働可能です。", hasAttachments: false };

describe("prefilterEmail（LLM前の足切り）", () => {
  it("通常の人材/案件メールは通す（skip=false）", () => {
    expect(prefilterEmail(base).skip).toBe(false);
  });

  it("no-reply 等の自動送信アドレスは弾く", () => {
    expect(prefilterEmail({ ...base, from: "no-reply@example.com" }).skip).toBe(true);
    expect(prefilterEmail({ ...base, from: "System <noreply@example.com>" }).skip).toBe(true);
    expect(prefilterEmail({ ...base, from: "mailer-daemon@mail.example.com" }).skip).toBe(true);
    expect(prefilterEmail({ ...base, from: "notifications@service.com" }).skip).toBe(true);
    expect(prefilterEmail({ ...base, from: "donotreply@a.b.com" }).skip).toBe(true);
  });

  it("自動返信・配信停止・配信不能の件名は弾く", () => {
    expect(prefilterEmail({ ...base, subject: "自動応答: 不在にしております" }).skip).toBe(true);
    expect(prefilterEmail({ ...base, subject: "Automatic reply: Out of Office" }).skip).toBe(true);
    expect(prefilterEmail({ ...base, subject: "配信停止のご案内" }).skip).toBe(true);
    expect(prefilterEmail({ ...base, subject: "Undelivered Mail Returned to Sender" }).skip).toBe(true);
  });

  it("本文が空で添付も無いものは弾く", () => {
    expect(prefilterEmail({ ...base, text: "", hasAttachments: false }).skip).toBe(true);
    expect(prefilterEmail({ ...base, text: "  \n ", hasAttachments: false }).skip).toBe(true);
  });

  it("本文が空でも添付があれば通す（スキルシート添付のみのケース）", () => {
    expect(prefilterEmail({ ...base, text: "", hasAttachments: true }).skip).toBe(false);
  });

  it("普通の会社アドレス・通常件名は弾かない（取りこぼし防止）", () => {
    expect(prefilterEmail({ ...base, from: "tanaka@example.co.jp", subject: "【案件】Java/AWS" }).skip).toBe(false);
    // "reply" を含むが no-reply ではない一般アドレスは通す
    expect(prefilterEmail({ ...base, from: "reply.tanaka@example.co.jp" }).skip).toBe(false);
  });
});
