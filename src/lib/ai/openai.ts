import OpenAI from "openai";
import type { EmailAttachment, EmailClassification } from "./types";
import { DEFAULT_CLASSIFY_PROMPT } from "./prompts";
import { prisma } from "@/lib/prisma";

// OpenAI(ChatGPT)によるメール分類の実装。
// 分類(人材/案件/対象外)は「テキストのみ・単純3分類・高頻度」で、精度がAnthropicと実質同等な一方
// 小型モデルの方が安い。ここだけ OpenAI に差し替えてコストを下げる（抽出/マッチ等はAnthropicのまま）。
// getAI() で OPENAI_API_KEY があるとき classifyEmail のみ本実装に差し替わる（see ./index.ts）。

// コスト最優先で安価な gpt-4o-mini をデフォルトに。OPENAI_MODEL で上書き可（例 gpt-5-mini）。
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// 分類は件名＋冒頭で判定できるので先頭だけ送る（Anthropic版と同じ 2000 文字）。
const CLASSIFY_MAX_CHARS = 2000;

// 100万トークンあたりの単価（USD）。コスト可視化ログ用。未知モデルは gpt-4o-mini 相当で概算。
const PRICES: Record<string, { in: number; out: number; cached: number }> = {
  "gpt-4o-mini": { in: 0.15, out: 0.6, cached: 0.075 },
  "gpt-4o": { in: 2.5, out: 10, cached: 1.25 },
};
const FALLBACK_PRICE = { in: 0.15, out: 0.6, cached: 0.075 };

// OpenAI の構造化出力(json_schema strict)。CLASSIFY_SCHEMA(anthropic版)と同形。
// strict モードは additionalProperties:false と全プロパティ required が必須（下記は充足）。
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

/** メール分類(人材/案件/対象外)だけを OpenAI で実装する。他メソッドは Anthropic 側が担う。 */
export class OpenAIClassifierService {
  private client: OpenAI;

  constructor() {
    // Reads OPENAI_API_KEY from the environment.
    // 取込エンドポイント(maxDuration=300)を1コールで食い潰さないよう短めのタイムアウト。
    this.client = new OpenAI({
      timeout: Number(process.env.OPENAI_TIMEOUT_MS ?? "45000") || 45000,
      maxRetries: Number(process.env.OPENAI_MAX_RETRIES ?? "2") || 2,
    });
  }

  async classifyEmail(
    rawEmail: string,
    _attachments?: EmailAttachment[],
    systemPrompt?: string,
  ): Promise<EmailClassification> {
    // 添付は送らない（Anthropic版と同じ。件名＋冒頭で十分・コスト削減）。
    const res = await this.client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt?.trim() || DEFAULT_CLASSIFY_PROMPT },
        { role: "user", content: rawEmail.slice(0, CLASSIFY_MAX_CHARS) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "email_classification",
          strict: true,
          schema: CLASSIFY_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    });
    logUsage("classify", res.usage ?? undefined);

    const content = res.choices[0]?.message?.content;
    if (!content) throw new Error("AI応答にテキストが含まれていません");
    return JSON.parse(content) as EmailClassification;
  }
}
