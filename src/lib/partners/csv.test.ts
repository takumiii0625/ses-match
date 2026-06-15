import { describe, it, expect } from "vitest";
import { parseBlastmailCsv, parseCsvLine, mapStatus, decodeCsv } from "./csv";

describe("mapStatus", () => {
  it("配信中→ACTIVE、それ以外は送信対象外", () => {
    expect(mapStatus("配信中")).toBe("ACTIVE");
    expect(mapStatus("エラー停止")).toBe("BOUNCED");
    expect(mapStatus("配信停止")).toBe("UNSUBSCRIBED");
    expect(mapStatus("解除")).toBe("UNSUBSCRIBED");
  });
});

describe("parseCsvLine", () => {
  it("引用符を外し、引用符内のカンマを保持", () => {
    expect(parseCsvLine('"0","配信中","ご担当者","株式会社A, B","x@a.com"')).toEqual([
      "0",
      "配信中",
      "ご担当者",
      "株式会社A, B",
      "x@a.com",
    ]);
  });
  it('"" は引用符1つにエスケープ', () => {
    expect(parseCsvLine('"a""b",c')).toEqual(['a"b', "c"]);
  });
});

describe("decodeCsv", () => {
  it("UTF-8 BOMを除去してデコード", () => {
    const body = '"0","配信中","ご担当者","株式会社X","x@x.com"';
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(body)]);
    expect(decodeCsv(bytes)).toBe(body);
  });
});

const SAMPLE = `"エラーカウント数","状態","氏名","会社名","E-Mail"
"0","配信中","ご担当者","株式会社アクティアス","k.uga@actias.co.jp"
"1","エラー停止","ご担当者","合同会社Radineer","support@radineer.com"
"0","配信停止","ご担当者","株式会社X","x@x.co.jp"`;

describe("parseBlastmailCsv", () => {
  it("ヘッダを飛ばして各行をパースし、状態を正規化", () => {
    const { rows, errors } = parseBlastmailCsv(SAMPLE);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      company: "株式会社アクティアス",
      email: "k.uga@actias.co.jp",
      status: "ACTIVE",
      errorCount: 0,
    });
    expect(rows[1].status).toBe("BOUNCED");
    expect(rows[2].status).toBe("UNSUBSCRIBED");
  });

  it("メール欠落・形式不正・会社名空はエラー行に積む", () => {
    const csv = `"エラーカウント数","状態","氏名","会社名","E-Mail"
"0","配信中","ご担当者","会社A",""
"0","配信中","ご担当者","会社B","not-an-email"
"0","配信中","ご担当者","","z@z.com"`;
    const { rows, errors } = parseBlastmailCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(3);
  });

  it("メールは小文字化される", () => {
    const csv = `"エラーカウント数","状態","氏名","会社名","E-Mail"
"0","配信中","ご担当者","会社A","Foo.Bar@Example.COM"`;
    const { rows } = parseBlastmailCsv(csv);
    expect(rows[0].email).toBe("foo.bar@example.com");
  });
});
