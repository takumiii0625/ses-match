import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import { extractTextItems, getDocumentProxy } from "unpdf";
import { prisma } from "@/lib/prisma";
import type { EmailAttachment } from "@/lib/ai/types";
import { htmlToText, pickRicherBody } from "./html-text";
import { extractOfficeText, isOfficeFile } from "@/lib/office";

/**
 * PDFバイト列からテキストを抽出する。テキストPDFなら成功し、LLMには
 * （高価な画像トークンの document ブロックではなく）安価なテキストで送れる。
 * スキャンPDF等で抽出できない場合は undefined を返し、呼び出し側で document に
 * フォールバックする。
 */
async function extractPdfText(bytes: Buffer): Promise<string | undefined> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    // テキスト項目を hasEOL（行末フラグ）付きで取得し、行構造を保持して結合する。
    // 高レベルの extractText は項目を空白連結し改行が失われ「塊」になるため使わない。
    const { items } = await extractTextItems(pdf);
    const pages = items.map((pageItems) => {
      const lines: string[] = [];
      let line = "";
      for (const it of pageItems) {
        line += it.str ?? "";
        if (it.hasEOL) {
          lines.push(line);
          line = "";
        }
      }
      if (line) lines.push(line);
      return lines.join("\n");
    });
    const t = pages
      .join("\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return t.length > 0 ? t : undefined;
  } catch {
    return undefined;
  }
}

// Gmail integration (read-only). Reads messages from the connected mailbox,
// extracts plain-text body + PDF attachments. OAuth refresh token is stored
// in the DB (OAuthToken). Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env.

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function getRedirectUri(): string {
  return (
    process.env.GOOGLE_REDIRECT_URI ??
    `${process.env.APP_URL ?? "http://localhost:3000"}/api/google/callback`
  );
}

export function oauthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が設定されていません",
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
}

export function authUrl(): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force refresh_token issuance
    scope: [GMAIL_SCOPE],
  });
}

/** Exchange the OAuth code for tokens and persist the refresh token. */
export async function saveTokenFromCode(code: string): Promise<string> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "refresh_token が取得できませんでした（既に連携済みの可能性。Googleアカウントのアクセス権を解除して再連携してください）",
    );
  }
  client.setCredentials(tokens);
  // best-effort: look up the connected address
  let account: string | undefined;
  try {
    const gmail = google.gmail({ version: "v1", auth: client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    account = profile.data.emailAddress ?? undefined;
  } catch {}

  await prisma.oAuthToken.upsert({
    where: { provider: "google" },
    create: {
      provider: "google",
      account,
      refreshToken: tokens.refresh_token,
      scope: GMAIL_SCOPE,
    },
    update: { account, refreshToken: tokens.refresh_token, scope: GMAIL_SCOPE },
  });
  return account ?? "(unknown)";
}

export async function getConnection() {
  return prisma.oAuthToken.findUnique({ where: { provider: "google" } });
}

async function authedGmail(): Promise<gmail_v1.Gmail> {
  const token = await getConnection();
  if (!token) throw new Error("Gmail未連携です");
  const client = oauthClient();
  client.setCredentials({ refresh_token: token.refreshToken });
  return google.gmail({ version: "v1", auth: client });
}

export interface FetchedEmail {
  gmailId: string;
  messageId: string; // RFC Message-ID header (fallback: gmailId)
  from?: string;
  to?: string;
  subject?: string;
  date?: Date;
  text: string;
  attachments: EmailAttachment[];
}

function header(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string | undefined {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())
    ?.value as string | undefined;
}

function decodeBody(data?: string | null): string {
  if (!data) return "";
  return Buffer.from(data, "base64url").toString("utf-8");
}

/** Walk MIME parts, collecting plain text and PDF attachment refs. */
function walkParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  out: { text: string[]; html: string[]; atts: gmail_v1.Schema$MessagePart[] },
) {
  if (!part) return;
  const mime = part.mimeType ?? "";
  if (part.filename && part.body?.attachmentId) {
    out.atts.push(part);
  } else if (mime === "text/plain") {
    out.text.push(decodeBody(part.body?.data));
  } else if (mime === "text/html") {
    out.html.push(decodeBody(part.body?.data));
  }
  for (const p of part.parts ?? []) walkParts(p, out);
}


function mailQuery(windowDays?: number): string {
  const to = process.env.MAIL_ADDRESS ? `to:${process.env.MAIL_ADDRESS} ` : "";
  // 明示指定（取りこぼし回収用）が最優先: 直近 windowDays 日を対象に。
  if (windowDays && windowDays > 0) return `${to}newer_than:${windowDays}d`;
  // 次点: MAIL_QUERY（直接指定）> MAIL_WINDOW_DAYS（newer_than:Nd）。
  if (process.env.MAIL_QUERY) return process.env.MAIL_QUERY;
  const days = process.env.MAIL_WINDOW_DAYS;
  if (days) return `${to}newer_than:${days}d`;
  // 既定は「直近1日(newer_than:1d)」。after:<日付> はGmailアカウントのタイムゾーン境界で
  // JSTの日中に取りこぼすため、タイムゾーン非依存の相対指定にする（重複はdedupでスキップ）。
  return `${to}newer_than:1d`;
}

/** List + fetch messages matching the query (default: addressed to MAIL_ADDRESS). */
export async function fetchEmails(limit = 20, windowDays?: number): Promise<FetchedEmail[]> {
  const gmail = await authedGmail();
  const list = await gmail.users.messages.list({
    userId: "me",
    q: mailQuery(windowDays),
    maxResults: limit,
  });
  const ids = (list.data.messages ?? []).map((m) => m.id!).filter(Boolean);

  const out: FetchedEmail[] = [];
  for (const id of ids) {
    out.push(await parseMessage(gmail, id));
  }
  return out;
}

export interface MessageIdPage {
  ids: string[]; // Gmail message id（本文未取得・軽い）
  nextPageToken: string | null;
}

/**
 * ページ単位で Gmail メッセージID一覧だけを取得（本文は取らないので軽い）。
 * 既取込は ID で事前に除外し、新規だけ fetchEmailById で本文取得することで、
 * 重複ページを安く飛ばしつつ全ページを辿れる（タイムアウト回避）。
 */
export async function listMessageIds(
  pageSize = 12,
  pageToken?: string,
  windowDays?: number,
): Promise<MessageIdPage> {
  const gmail = await authedGmail();
  const list = await gmail.users.messages.list({
    userId: "me",
    q: mailQuery(windowDays),
    maxResults: pageSize,
    pageToken: pageToken || undefined,
  });
  const ids = (list.data.messages ?? []).map((m) => m.id!).filter(Boolean);
  return { ids, nextPageToken: list.data.nextPageToken ?? null };
}

/** Fetch + parse a single message by its Gmail id (for backfill). */
export async function fetchEmailById(gmailId: string): Promise<FetchedEmail | null> {
  const gmail = await authedGmail();
  try {
    return await parseMessage(gmail, gmailId);
  } catch {
    return null;
  }
}

/** Parse one Gmail message into a FetchedEmail (body text + PDF attachments). */
async function parseMessage(
  gmail: gmail_v1.Gmail,
  id: string,
): Promise<FetchedEmail> {
  const msg = await gmail.users.messages.get({ userId: "me", id, format: "full" });
  const payload = msg.data.payload;
  const headers = payload?.headers;
  const acc = { text: [] as string[], html: [] as string[], atts: [] as gmail_v1.Schema$MessagePart[] };
  walkParts(payload, acc);

  // スキルシート添付を取り込む: PDF＋Excel(.xlsx/.xls)＋Word(.docx) をテキスト化。
  const attachments: EmailAttachment[] = [];
  for (const a of acc.atts.slice(0, 4)) {
    const filename = a.filename ?? "attachment";
    const isPdf = a.mimeType === "application/pdf" || /\.pdf$/i.test(filename);
    const isOffice = isOfficeFile(filename);
    if (!isPdf && !isOffice) continue;
    try {
      const att = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: id,
        id: a.body!.attachmentId!,
      });
      const bytes = Buffer.from(att.data.data ?? "", "base64url");
      if (isPdf) {
        attachments.push({
          filename,
          mediaType: "application/pdf",
          dataBase64: bytes.toString("base64"),
          // テキストPDFは抽出（LLMには安価なテキストで送る）。スキャンPDFは undefined→document送付。
          text: await extractPdfText(bytes),
        });
      } else {
        // Excel/Word はClaudeが直接読めないのでサーバ側でテキスト抽出（本文をdataBase64には積まない）。
        const text = await extractOfficeText(filename, bytes.toString("base64"));
        attachments.push({
          filename,
          mediaType: a.mimeType ?? "application/octet-stream",
          dataBase64: "",
          text: text ?? undefined,
        });
      }
    } catch {}
  }

  // 本文は「プレーン」と「HTML由来」から情報量の多い方を採用（リッチHTMLの取りこぼし対策）。
  const plain = acc.text.join("\n").trim();
  const htmlText = htmlToText(acc.html.join("\n"));
  const text = pickRicherBody(plain, htmlText) || msg.data.snippet || "";
  const dateStr = header(headers, "Date");
  return {
    gmailId: id,
    messageId: header(headers, "Message-ID") ?? id,
    from: header(headers, "From"),
    to: header(headers, "To"),
    subject: header(headers, "Subject"),
    date: dateStr ? new Date(dateStr) : undefined,
    text,
    attachments,
  };
}
