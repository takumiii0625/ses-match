import { describe, it, expect } from "vitest";
import { htmlToText, pickRicherBody, decodeEntities } from "./html-text";

describe("htmlToText", () => {
  it("<br> と </p></div> を改行に変換する", () => {
    const html = "<div>1行目</div><div>2行目</div><p>3行目<br>3.5行目</p>";
    expect(htmlToText(html)).toBe("1行目\n2行目\n3行目\n3.5行目");
  });

  it("色付き・ハイライトの span/font の中身は残す（改行も保持）", () => {
    const html =
      '<div>・<span style="color:blue">単価100万</span>｜リモート併用可</div>' +
      '<div>・<span style="background:yellow">React</span>+<font color="red">Java</font>基本設計</div>';
    expect(htmlToText(html)).toBe("・単価100万｜リモート併用可\n・React+Java基本設計");
  });

  it("style/script は除去する", () => {
    const html = "<style>.x{color:red}</style><div>本文</div><script>x()</script>";
    expect(htmlToText(html)).toBe("本文");
  });

  it("エンティティを復元する", () => {
    expect(decodeEntities("A&amp;B &lt;tag&gt; &#39;q&#39; &nbsp;x")).toBe("A&B <tag> 'q'  x");
  });

  it("過剰な空行は2行までに詰める", () => {
    const html = "<div>A</div><br><br><br><div>B</div>";
    expect(htmlToText(html)).toBe("A\n\nB");
  });
});

describe("pickRicherBody", () => {
  it("プレーンが空ならHTML由来を採用", () => {
    expect(pickRicherBody("", "案件詳細\n単価100万")).toBe("案件詳細\n単価100万");
  });
  it("プレーンがURLだけ等で乏しければHTML由来を採用", () => {
    const plain = "詳細はこちら https://x.example/abc";
    const html = "■案件\n単価100万\nReact/Java\n勤務地 東京\n期間 7月〜長期\n面談1回";
    expect(pickRicherBody(plain, html)).toBe(html);
  });
  it("プレーンが十分ならプレーンを維持する", () => {
    const plain =
      "お世話になっております。下記案件をご案内します。単価80万。React/Java。勤務地は東京。よろしくお願いします。";
    const html = "<short>";
    expect(pickRicherBody(plain, html)).toBe(plain);
  });
});
