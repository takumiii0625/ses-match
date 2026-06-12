import { Resend } from "resend";
import { formatRate } from "@/lib/utils";

// 送信元・返信先。From は Resend で認証済みドメイン（obfall.co.jp）であること。
const FROM = process.env.MAIL_FROM ?? "OBFall 営業 <sales@obfall.co.jp>";
const REPLY_TO = process.env.MAIL_REPLY_TO ?? "sales@obfall.co.jp";

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
}

/** Resend でメール送信。RESEND_API_KEY 必須。 */
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
  });
  if (error) throw new Error(error.message ?? "メール送信に失敗しました");
  return { id: data?.id ?? null };
}

export interface ProjectEmailProject {
  title: string;
  clientName: string | null;
  requiredSkills: string[];
  rateMin: number | null;
  rateMax: number | null;
  location: string | null;
  startText: string | null;
  description: string | null;
  channelText: string | null;
}

/**
 * 案件→人材への案内メール（仮テンプレート）。本文ロジックは後で差し替える前提。
 */
export function buildProjectEmail(
  talentName: string,
  p: ProjectEmailProject,
): { subject: string; text: string } {
  const subject = `案件のご案内：${p.title}`;
  const lines = [
    `${talentName} 様`,
    ``,
    `いつもお世話になっております。OBFall 営業です。`,
    `下記の案件についてご案内いたします。ご興味があればご返信ください。`,
    ``,
    `■ 案件名：${p.title}`,
    p.clientName ? `■ クライアント：${p.clientName}` : "",
    p.requiredSkills.length ? `■ 必須スキル：${p.requiredSkills.join(" / ")}` : "",
    p.rateMin != null || p.rateMax != null ? `■ 単価：${formatRate(p.rateMin, p.rateMax)}` : "",
    p.location ? `■ 勤務地：${p.location}` : "",
    p.startText ? `■ 開始：${p.startText}` : "",
    p.channelText ? `■ 商流：${p.channelText}` : "",
    p.description ? `\n${p.description}` : "",
    ``,
    `ご検討のほどよろしくお願いいたします。`,
    `OBFall 営業 / sales@obfall.co.jp`,
  ].filter((l) => l !== "");
  return { subject, text: lines.join("\n") };
}
