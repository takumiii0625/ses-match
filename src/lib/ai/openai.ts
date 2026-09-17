import OpenAI from "openai";
import type {
  EmailAttachment,
  EmailClassification,
  ParsedTalent,
  ParsedProject,
} from "./types";
import {
  DEFAULT_CLASSIFY_PROMPT,
  DEFAULT_TALENT_PROMPT,
  DEFAULT_PROJECT_PROMPT,
} from "./prompts";
import { TALENT_SCHEMA, PROJECT_SCHEMA, normalizeManYen } from "./anthropic";
import { prisma } from "@/lib/prisma";

// OpenAI(ChatGPT)による処理の実装。分類に加え、「添付がテキスト抽出済み」の抽出も担う。
// - 分類(人材/案件/対象外): テキストのみ・単純・高頻度で、精度がAnthropicと実質同等かつ小型モデルが安い。
// - 抽出(人材/案件): 添付がテキスト化済み(PDF→unpdf/Excel/Word)ならOpenAIで十分安く読める。
//   一方スキャンPDF等の document(base64画像)送信が要るケースは精度重視でAnthropicに残す（see ./index.ts の振り分け）。
// getAI() で OPENAI_API_KEY があるとき、上記に該当する呼び出しが本実装に差し替わる。

// コスト最優先で安価な gpt-4o-mini をデフォルトに。OPENAI_MODEL で上書き可（例 gpt-5-mini）。
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// 分類は件名＋冒頭で判定できるので先頭だけ送る（Anthropic版と同じ 2000 文字）。
const CLASSIFY_MAX_CHARS = 2000;
// 抽出でLLMに渡す本文/添付テキストの最大文字数（Anthropic版 MAX_EMAIL_CHARS と揃える）。
const MAX_EMAIL_CHARS = Number(process.env.AI_MAX_EMAIL_CHARS ?? "8000") || 8000;

// 100万トークンあたりの単価（USD）。コスト可視化ログ用。未知モデルは gpt-4o-mini 相当で概算。
const PRICES: Record<string, { in: number; out: number; cached: number }> = {
  "gpt-4o-mini": { in: 0.15, out: 0.6, cached: 0.075 },
  "gpt-4o": { in: 2.5, out: 10, cached: 1.25 },
};
const FALLBACK_PRICE = { in: 0.15, out: 0.6, cached: 0.075 };

// OpenAI の構造化出力(json_schema strict)。CLASSIFY_SCHEMA(anthropic版)と同形。
const CLASSIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["TALENT", "PROJECT", "IGNORE"] },
    reason: { type: "string" },
  },
  required: ["kind", "reason"],
} as const;

interface OpenAIUsageLike {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
}

/** 1コールのトークン使用量と概算コストをログ＋DBに記録（/reports で日次・月次集計）。 */
function logUsage(tag: string, usage: OpenAIUsageLike | undefined, items = 0): void {
  if (!usage) return;
  const p = PRICES[MODEL] ?? FALLBACK_PRICE;
  const cacheR = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const inp = Math.max(0, (usage.prompt_tokens ?? 0) - cacheR);
  const out = usage.completion_tokens ?? 0;
  const cost = (inp * p.in + cacheR * p.cached + out * p.out) / 1e6;
  console.log(
    `[ai:${tag}] model=${MODEL} in=${inp} cacheR=${cacheR} out=${out} ~$${cost.toFixed(4)}`,
  );
  void prisma.aiUsage
    .create({
      data: {
        tag,
        model: MODEL,
        inputTokens: inp,
        cacheRead: cacheR,
        cacheWrite: 0,
        outputTokens: out,
        cost,
        items,
      },
    })
    .catch(() => {});
}

// API JSON(null) → TS interface(undefined)。任意項目のnullをundefinedに畳む。
function denull<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const k of Object.keys(out)) {
    if (out[k] === null) out[k] = undefined;
  }
  return out as T;
}

/**
 * 添付のうち「document(base64 PDF)として送らないと読めない」ものがあるか。
 * テキスト抽出済み(att.text あり)ならテキストで送れる＝OpenAIで扱える。
 * スキャンPDF等でテキストが無くPDF実体だけのものは Claude のPDFネイティブ機能が要る。
 */
export function attachmentsNeedNativeDoc(attachments?: EmailAttachment[]): boolean {
  for (const att of attachments ?? []) {
    const hasText = !!att.text && att.text.trim().length > 40;
    const isPdf = att.mediaType === "application/pdf";
    if (!hasText && isPdf && att.dataBase64) return true;
  }
  return false;
}

/** 分類＋テキスト抽出(人材/案件)を OpenAI で実装。document送信が要る抽出は担わない（Anthropic側）。 */
export class OpenAIService {
  private client: OpenAI;

  constructor() {
    // Reads OPENAI_API_KEY from the environment.
    // 取込エンドポイント(maxDuration=300)を1コールで食い潰さないよう短めのタイムアウト。
    this.client = new OpenAI({
      timeout: Number(process.env.OPENAI_TIMEOUT_MS ?? "45000") || 45000,
      maxRetries: Number(process.env.OPENAI_MAX_RETRIES ?? "2") || 2,
    });
  }

  /** メール本文＋テキスト化済み添付を1本のテキストに連結（Anthropic版 buildContent のテキスト経路と同等）。 */
  private buildText(rawEmail: string, attachments?: EmailAttachment[]): string {
    const clip = (s: string) =>
      s.length > MAX_EMAIL_CHARS ? s.slice(0, MAX_EMAIL_CHARS) + "\n…（以下省略）" : s;
    let text = clip(rawEmail);
    for (const att of attachments ?? []) {
      if (att.text && att.text.trim().length > 40) {
        text += `\n\n【添付: ${att.filename}】\n${clip(att.text)}`;
      }
      // テキストが無い添付(スキャンPDF等)はOpenAI経路には来ない想定なのでスキップ。
    }
    return text;
  }

  private async extract<T>(
    tag: string,
    system: string,
    schema: Record<string, unknown>,
    schemaName: string,
    userText: string,
  ): Promise<T> {
    const res = await this.client.chat.completions.create({
      model: MODEL,
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, strict: true, schema },
      },
    });
    logUsage(tag, res.usage ?? undefined);
    const content = res.choices[0]?.message?.content;
    if (!content) throw new Error("AI応答にテキストが含まれていません");
    return denull(JSON.parse(content)) as T;
  }

  async classifyEmail(
    rawEmail: string,
    _attachments?: EmailAttachment[],
    systemPrompt?: string,
  ): Promise<EmailClassification> {
    // 添付は送らない（Anthropic版と同じ。件名＋冒頭で十分・コスト削減）。
    return this.extract<EmailClassification>(
      "classify",
      systemPrompt?.trim() || DEFAULT_CLASSIFY_PROMPT,
      CLASSIFY_SCHEMA as unknown as Record<string, unknown>,
      "email_classification",
      rawEmail.slice(0, CLASSIFY_MAX_CHARS),
    );
  }

  async parseTalentEmail(
    rawEmail: string,
    attachments?: EmailAttachment[],
    systemPrompt?: string,
  ): Promise<ParsedTalent> {
    const t = await this.extract<ParsedTalent>(
      "extract",
      systemPrompt?.trim() || DEFAULT_TALENT_PROMPT,
      TALENT_SCHEMA as unknown as Record<string, unknown>,
      "parsed_talent",
      this.buildText(rawEmail, attachments),
    );
    // 円で抽出された単価（例 500000）を万円（50）に補正する。
    t.desiredRateMin = normalizeManYen(t.desiredRateMin) ?? undefined;
    t.desiredRateMax = normalizeManYen(t.desiredRateMax) ?? undefined;
    return t;
  }

  async parseProjectEmail(
    rawEmail: string,
    attachments?: EmailAttachment[],
    systemPrompt?: string,
  ): Promise<ParsedProject> {
    const p = await this.extract<ParsedProject>(
      "extract",
      systemPrompt?.trim() || DEFAULT_PROJECT_PROMPT,
      PROJECT_SCHEMA as unknown as Record<string, unknown>,
      "parsed_project",
      this.buildText(rawEmail, attachments),
    );
    p.rateMin = normalizeManYen(p.rateMin) ?? undefined;
    p.rateMax = normalizeManYen(p.rateMax) ?? undefined;
    return p;
  }
}
