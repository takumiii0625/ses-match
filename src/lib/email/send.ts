import { Resend } from "resend";

// 送信元・返信先。From は Resend で認証済みドメイン（obfall.co.jp）であること。
const FROM = process.env.MAIL_FROM ?? "OBFall 営業 <sales@obfall.co.jp>";
const REPLY_TO = process.env.MAIL_REPLY_TO ?? "sales@obfall.co.jp";

const SIGNATURE = `-----------------------------------------
OBFall株式会社
営業共通：sales@obfall.co.jp

〒105-0022
東京都港区海岸1-2-3　汐留芝離宮ビルディング 21F
TEL：03-5403-5904
URL：https://obfall.com
-----------------------------------------`;

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
}

/**
 * プレーンテキスト本文をHTMLに変換する。
 * - UTF-8で安定表示（文字化け対策）。
 * - 「-----」だけの行は罫線<hr>に変換（Gmailが署名とみなして折りたたむのを防ぐ）。
 */
export function textToHtml(text: string): string {
  const body = text
    .split("\n")
    .map((line) => {
      if (/^[-=ー─━_]{4,}\s*$/.test(line.trim())) {
        return `<hr style="border:none;border-top:1px solid #d0d0d0;margin:10px 0;">`;
      }
      return line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    })
    .join("\n");
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"></head><body><div style="white-space:pre-wrap;font-family:'Hiragino Sans','Yu Gothic','Meiryo',sans-serif;font-size:14px;line-height:1.7;color:#1a1a1a;">${body}</div></body></html>`;
}

/** Resend でメール送信。RESEND_API_KEY 必須。HTML＋テキストの両方を送る（文字化け対策）。 */
export async function sendMail(input: SendMailInput): Promise<{ id: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY が未設定です");
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: input.to,
    replyTo: REPLY_TO,
    subject: input.subject,
    text: input.text,
    html: textToHtml(input.text),
  });
  if (error) throw new Error(error.message ?? "メール送信に失敗しました");
  return { id: data?.id ?? null };
}

/** From ヘッダ等から担当者名（表示名）を取り出す。"山田太郎 <a@b>" → 山田太郎 */
export function contactNameFromFrom(from?: string | null): string {
  if (!from) return "ご担当者";
  const m = from.match(/^\s*"?([^"<]+?)"?\s*</);
  const name = m?.[1]?.trim();
  if (name && !name.includes("@")) return name;
  return "ご担当者";
}

function stripParen(s: string): string {
  // 全角/半角の括弧書き（例: （当社同席））を除去
  return s.replace(/[（(][^）)]*[）)]/g, "").replace(/[ 　]+$/, "");
}

/**
 * 元案件メール本文を、送付用に整形する（■項目フォーマット前提）。
 * ルール:
 * - 単価は一律「スキル見合い」に置換
 * - 支払サイト / 契約形態 / 商流 の項目は削除（パターンが多いため一律カット）
 * - 商談は「（当社同席）」等の括弧書きを除去（例: Web1回（当社同席）→ Web1回）
 * 先頭の挨拶等は最初の ■/【 から開始して落とし、署名区切り以降は打ち切る。
 */
export function transformProjectBody(raw: string): string {
  const all = raw.split(/\r?\n/);
  const start = all.findIndex((l) => /^[\s　]*[■【]/.test(l));
  const lines = start >= 0 ? all.slice(start) : all;

  const out: string[] = [];
  let mode: "keep" | "drop" | "tanka" | "shodan" = "keep";
  for (const line of lines) {
    // 署名区切り（---- / ==== / ──── 等）が来たら、案件本文は終わりとみなし打ち切る
    if (/^[\s　]*[-=ー─━*＊_]{4,}/.test(line) && out.some((o) => o.includes("■"))) break;

    const h = line.match(/^[\s　]*■\s*([^：:]+)[：:]?/);
    if (h) {
      const header = h[1].replace(/\s/g, "");
      if (/支払(い)?サイト|契約形態|商流/.test(header)) {
        mode = "drop";
        continue;
      }
      if (/単価/.test(header)) {
        mode = "tanka";
        out.push("■単価：");
        out.push("　スキル見合い");
        continue;
      }
      if (/商談/.test(header)) {
        mode = "shodan";
        out.push(stripParen(line));
        continue;
      }
      mode = "keep";
      out.push(line);
      continue;
    }
    // 継続行（■で始まらない行）はその項目に属する
    if (mode === "drop" || mode === "tanka") continue;
    if (mode === "shodan") {
      out.push(stripParen(line));
      continue;
    }
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export interface ProjectEmailInput {
  talentName: string; // エンジニアのイニシャル/氏名
  contactFrom: string | null; // 人材を送ってきたメールの From（担当者名の抽出元）
  projectTitle: string;
  projectBlock: string; // 整形済みの案件本文（LLM整形 or ルール整形の結果）
}

/** 案件→人材への案内メール本文を組み立てる（定型の挨拶＋整形済み案件＋署名）。 */
export function buildProjectEmail(input: ProjectEmailInput): {
  subject: string;
  text: string;
} {
  const contactName = contactNameFromFrom(input.contactFrom);
  const block = input.projectBlock.trim();
  const subject = `【案件のご案内】${input.projectTitle}`;
  const text = [
    `${contactName}様`,
    ``,
    `お世話になっております。`,
    `OBFall営業部です。`,
    ``,
    `要員様のご紹介ありがとうございます。`,
    ``,
    `${input.talentName}様宛に下記案件はいかがでしょうか。`,
    `ご検討いただけますと幸いです。`,
    ``,
    block,
    ``,
    `何卒よろしくお願い致します。`,
    SIGNATURE,
  ].join("\n");
  return { subject, text };
}
