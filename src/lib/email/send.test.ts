import { describe, it, expect } from "vitest";
import { transformProjectBody, contactNameFromFrom, buildProjectEmail } from "./send";

const SAMPLE = `お世話になっております。〇〇社の田中です。下記案件です。

■案件名：
　外資系製薬業向け業務整理・グローバル連携コンサルタント募集
■案件内容：
　•外資系製薬企業向け案件
＜作業内容＞
　・業務ヒアリング
■担当工程：
　SD/MM コンサルタント
■作業場所：
　基本リモート（兵庫）
■単価：
　80万円
■必要スキル：
　・SAP（SD領域）の知見
■契約期間：
　6月～中長期
■支払サイト：
　月末締め翌月末支払い
■募集人数：
　1名
■契約形態：
　準委任
■商流：
　元請（決裁企業）
■商談：
　Web1回（当社同席）
■年齢：
　指定なし
■備考：
　・夜間会議の可能性あり`;

describe("transformProjectBody", () => {
  const out = transformProjectBody(SAMPLE);

  it("先頭の挨拶を落とし、最初の■から始まる", () => {
    expect(out.startsWith("■案件名：")).toBe(true);
    expect(out).not.toContain("田中です");
  });
  it("支払サイト/契約形態/商流の項目は削除", () => {
    expect(out).not.toContain("支払サイト");
    expect(out).not.toContain("月末締め");
    expect(out).not.toContain("契約形態");
    expect(out).not.toContain("準委任");
    expect(out).not.toContain("商流");
    expect(out).not.toContain("元請");
  });
  it("単価は一律スキル見合い", () => {
    expect(out).toContain("■単価：");
    expect(out).toContain("スキル見合い");
    expect(out).not.toContain("80万");
  });
  it("商談は括弧書き（当社同席）を除去", () => {
    expect(out).toContain("■商談：");
    expect(out).toContain("Web1回");
    expect(out).not.toContain("当社同席");
  });
  it("他の項目は残る", () => {
    expect(out).toContain("■案件名：");
    expect(out).toContain("■担当工程：");
    expect(out).toContain("■備考：");
    expect(out).toContain("SAP（SD領域）");
  });
});

describe("contactNameFromFrom", () => {
  it("表示名を抽出", () => {
    expect(contactNameFromFrom("山田太郎 <yamada@partner.co.jp>")).toBe("山田太郎");
    expect(contactNameFromFrom('"佐藤 花子" <sato@x.com>')).toBe("佐藤 花子");
  });
  it("名前が無ければ ご担当者", () => {
    expect(contactNameFromFrom("info@x.com")).toBe("ご担当者");
    expect(contactNameFromFrom(null)).toBe("ご担当者");
  });
});

describe("buildProjectEmail", () => {
  it("挨拶・氏名・署名が入る", () => {
    const { subject, text } = buildProjectEmail({
      talentName: "T.K",
      contactFrom: "山田太郎 <yamada@partner.co.jp>",
      projectTitle: "SAPコンサル",
      projectBlock: transformProjectBody(SAMPLE),
    });
    expect(subject).toContain("SAPコンサル");
    expect(text).toContain("山田太郎様");
    expect(text).toContain("T.K様宛に下記案件はいかがでしょうか。");
    expect(text).toContain("OBFall株式会社");
    expect(text).toContain("sales@obfall.co.jp");
    expect(text).toContain("■単価：");
  });
});
