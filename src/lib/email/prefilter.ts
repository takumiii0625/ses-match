// LLMを呼ぶ前の「足切り」フィルタ。明らかに人材でも案件でもないメール（自動返信・
// 配信不能通知・no-reply・空メール等）をルールだけで弾き、分類/抽出のLLMコストをゼロにする。
//
// 重要: 取りこぼし防止のため判定は保守的にする。少しでも人材/案件の可能性があるメールは
// skip=false にしてLLMに回す（誤って本物を捨てない）。高精度な非対象パターンだけを弾く。

export interface PrefilterInput {
  from?: string | null;
  subject?: string | null;
  text: string; // クリーン済み本文（cleanEmailText 後）
  hasAttachments: boolean;
}

export interface PrefilterResult {
  skip: boolean;
  reason: string;
}

// 自動送信・システム系の送信元（人材/案件メールはこの種のアドレスから来ない）。
const AUTO_SENDER =
  /(?:^|[._-])(?:no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounce[sd]?|mailer|notifications?|notify|alert[s]?|automated|auto-?confirm|noreply)(?:[._-]|@|$)/i;

// 自動返信・不在通知・配信停止系の件名（SESの人材/案件案内ではない）。
const AUTO_SUBJECT =
  /(自動(?:応答|返信)|不在(?:通知|のお知らせ)|Out of Office|Automatic reply|Auto-?Submitted|配信(?:停止|解除)(?:の)?(?:ご案内|手続き|設定)|購読(?:解除|停止)|メール(?:アドレス)?の?(?:変更|登録)(?:完了|のお知らせ)|Delivery (?:Status|has failed)|Undelivered Mail)/i;

/** 送信元ヘッダ（"名前 <a@b.com>"）からメールアドレス部分を取り出す。 */
function addressOf(from?: string | null): string {
  if (!from) return "";
  const m = from.match(/<([^>]+)>/) ?? from.match(/([^\s<>]+@[^\s<>]+)/);
  return (m ? m[1] : from).toLowerCase();
}

/**
 * LLMにかける前にメールを足切りする。skip=true なら分類/抽出のLLMを呼ばず IGNORE 扱い。
 * 保守的（高精度な非対象のみ弾く）= 本物の人材/案件を取りこぼさない。
 */
export function prefilterEmail(input: PrefilterInput): PrefilterResult {
  const addr = addressOf(input.from);
  const subject = (input.subject ?? "").trim();
  const body = input.text.trim();

  // ① 自動送信アドレス（no-reply / mailer-daemon / notifications 等）
  if (addr && AUTO_SENDER.test(addr)) {
    return { skip: true, reason: `自動送信アドレス（${addr}）` };
  }

  // ② 自動返信・不在・配信不能・配信停止などの件名
  if (subject && AUTO_SUBJECT.test(subject)) {
    return { skip: true, reason: `自動/通知系の件名（${subject.slice(0, 40)}）` };
  }

  // ③ 本文がほぼ空で添付も無い → 抽出する中身が無い
  if (!input.hasAttachments && body.length < 20) {
    return { skip: true, reason: "本文が空（抽出対象なし）" };
  }

  return { skip: false, reason: "" };
}
