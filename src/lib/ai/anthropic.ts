import Anthropic from "@anthropic-ai/sdk";
import type {
  AIService,
  ParsedTalent,
  ParsedProject,
  ProposalInput,
  EmailAttachment,
  EmailClassification,
  MatchProjectInput,
  MatchCandidateInput,
  RankedCandidate,
  ParsedSkillSheet,
  SkillYear,
} from "./types";
import {
  DEFAULT_MATCH_PROMPT,
  DEFAULT_CLASSIFY_PROMPT,
  DEFAULT_TALENT_PROMPT,
  DEFAULT_PROJECT_PROMPT,
  DEFAULT_PROPOSAL_PROMPT,
  DEFAULT_PROJECT_EMAIL_PROMPT,
  DEFAULT_SKILLSHEET_PROMPT,
  DEFAULT_SKILLSHEET_IMPROVE_PROMPT,
} from "./prompts";
import { createLimiter } from "@/lib/limit";
import { prisma } from "@/lib/prisma";

// Real LLM implementation of AIService backed by the Claude API.
// - Structured JSON extraction via output_config.format (json_schema)
// - Prompt caching on the (stable) system prompt
// Selected when AI_PROVIDER=anthropic and ANTHROPIC_API_KEY is set (see ./index.ts).

// コスト最優先で最も安い Haiku をデフォルトに（Opusの約1/5）。精度を上げたい場合は
// ANTHROPIC_MODEL で claude-sonnet-4-6 / claude-opus-4-8 に上書き可。
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";

// LLMに渡すメール本文/添付テキストの最大文字数。転送スレッド等の巨大本文で入力トークンが
// 膨らむのを防ぐ（コスト削減）。引用・フッタは cleanEmailText で除去済みなので、SES案件/人材
// メールの実質情報は概ね収まる。長い案件で取りこぼす場合は AI_MAX_EMAIL_CHARS で引き上げ可。
const MAX_EMAIL_CHARS = Number(process.env.AI_MAX_EMAIL_CHARS ?? "8000") || 8000;
// 分類は件名＋冒頭で判定できる。抽出と違い全文は不要（コスト削減）。
const CLASSIFY_MAX_CHARS = 2000;

// 100万トークンあたりの単価（USD）。コスト可視化ログ用。
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-opus-4-7": { in: 5, out: 25 },
  "claude-opus-4-6": { in: 5, out: 25 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/**
 * 1コールのトークン使用量と概算コストをログ出力＋DBに記録（/reportsで日次・月次集計）。
 * DB書き込みは fire-and-forget（失敗しても本処理に影響させない）。
 */
function logUsage(tag: string, usage: UsageLike | undefined, items = 0): void {
  if (!usage) return;
  const p = PRICES[MODEL] ?? { in: 5, out: 25 };
  const inp = usage.input_tokens ?? 0;
  const cacheR = usage.cache_read_input_tokens ?? 0;
  const cacheW = usage.cache_creation_input_tokens ?? 0;
  const out = usage.output_tokens ?? 0;
  const cost =
    (inp * p.in + cacheR * p.in * 0.1 + cacheW * p.in * 1.25 + out * p.out) / 1e6;
  console.log(
    `[ai:${tag}] model=${MODEL} in=${inp} cacheR=${cacheR} cacheW=${cacheW} out=${out} ~$${cost.toFixed(4)}`,
  );
  void prisma.aiUsage
    .create({
      data: {
        tag,
        model: MODEL,
        inputTokens: inp,
        cacheRead: cacheR,
        cacheWrite: cacheW,
        outputTokens: out,
        cost,
        items,
      },
    })
    .catch(() => {});
}

/** スキル名に経験年数を併記する（例: "Java(3年), TypeScript(10年), React"）。
 *  必須「◯年以上」に対する充足をLLMが判定できるよう、分かる言語は年数を付ける。 */
function formatSkillsWithYears(
  skills: string[],
  skillYears?: SkillYear[] | null,
  suffix = "年",
): string {
  const years = new Map<string, number>();
  for (const sy of skillYears ?? []) {
    if (sy?.skill) years.set(sy.skill.trim().toLowerCase(), sy.years);
  }
  const shown = new Set(skills.map((s) => s.trim().toLowerCase()));
  const parts = skills.map((s) => {
    const y = years.get(s.trim().toLowerCase());
    return y != null ? `${s}(${y}${suffix})` : s;
  });
  // skills に無い経験年数（別表記等）も末尾に追加する。
  for (const sy of skillYears ?? []) {
    if (sy?.skill && !shown.has(sy.skill.trim().toLowerCase())) {
      parts.push(`${sy.skill}(${sy.years}${suffix})`);
    }
  }
  return parts.join(", ");
}

// マッチ判定の1リクエストあたり候補数。小さいほど1回の出力が短く、件数が多くても
// max_tokens で打ち切られない。バッチは並列・独立なので1つ失敗しても他は残る。
const MATCH_BATCH_SIZE = 5;

// マッチ判定のAnthropic同時リクエスト上限。案件を並列処理しても、全バッチ呼び出しは
// このリミッタを通すので同時実行数はここで頭打ちになる（レート制限・タイムアウト対策）。
// DB接続圧を抑えるため既定を控えめに（過去の大量処理でNeon接続が枯渇した教訓）。
const MATCH_CONCURRENCY = Number(process.env.MATCH_CONCURRENCY ?? "3");
const matchLimiter = createLimiter(MATCH_CONCURRENCY);

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const REMOTE_ENUM = [
  "FULL_REMOTE",
  "MOSTLY_REMOTE",
  "HYBRID",
  "OFFICE_1",
  "OFFICE_2",
  "OFFICE_3",
  "OFFICE_4",
  "ONSITE",
];

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
const nullableInt = { anyOf: [{ type: "integer" }, { type: "null" }] };
const nullableRemote = {
  anyOf: [{ type: "string", enum: REMOTE_ENUM }, { type: "null" }],
};

const TALENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: nullableString,
    age: nullableInt,
    gender: {
      anyOf: [{ type: "string", enum: ["MALE", "FEMALE", "OTHER"] }, { type: "null" }],
      description:
        "性別。男性/男→MALE、女性/女→FEMALE、それ以外→OTHER。記載が無ければ null。",
    },
    nationality: {
      type: "string",
      enum: ["JAPAN", "OTHER"],
      description:
        "国籍。外国籍が読み取れる場合は OTHER。判断材料: 『国籍：中国/韓国/ベトナム…』等の非日本国籍の明記、『外国籍』『◯◯籍』、" +
        "『帰化』『在日』（帰化していても元外国籍なので OTHER）、日本語が母語でない旨の記載。" +
        "『日本』『日本国籍』と明記、または国籍の記載が一切無い場合は JAPAN（日本人は国籍を書かないことが多いため、未記載は日本人とみなす）。",
    },
    skills: { type: "array", items: { type: "string" } },
    mainSkills: { type: "array", items: { type: "string" } },
    skillYears: {
      type: "array",
      description:
        "経歴書/スキル一覧から、主要な言語・技術ごとの経験年数を抽出する。" +
        "例: [{\"skill\":\"Java\",\"years\":3},{\"skill\":\"TypeScript\",\"years\":10}]。" +
        "年数が明記または経歴から妥当に読み取れるものだけを入れる（言語・主要FW/DB/クラウドを優先）。skills と重複してよい。不明・記載なしは空配列。",
      items: {
        type: "object",
        properties: {
          skill: { type: "string" },
          years: { type: "number" },
        },
        required: ["skill", "years"],
        additionalProperties: false,
      },
    },
    desiredRateMin: nullableInt,
    desiredRateMax: nullableInt,
    remotePreference: nullableRemote,
    availabilityText: nullableString,
    nearestStation: nullableString,
    affiliation: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description:
        "人材の所属（商流上の立場）。メール内の「所属」「商流」「立場」ラベルの値をそのまま抽出する。" +
        "例: 『自社所属フリーランス』『一社先正社員』『1社先フリーランス』『プロパー』。" +
        "【所属】【商流】等のラベルや全角スペースは除く。記載が無ければ null。",
    },
    contactName: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description:
        "メールを送ってきた営業担当者の名前（人材本人の名前ではない）。" +
        "冒頭の挨拶や末尾の署名から抽出する。例: 『ハルミナの菅原です』→『菅原』、" +
        "署名の『営業部 田中太郎』→『田中太郎』。会社名や敬称は含めない。不明なら null。",
    },
    note: nullableString,
  },
  required: [
    "name",
    "age",
    "gender",
    "nationality",
    "skills",
    "mainSkills",
    "skillYears",
    "desiredRateMin",
    "desiredRateMax",
    "remotePreference",
    "availabilityText",
    "nearestStation",
    "affiliation",
    "contactName",
    "note",
  ],
} as const;

const PROJECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: nullableString,
    clientName: nullableString,
    requiredSkills: { type: "array", items: { type: "string" } },
    requiredSkillYears: {
      type: "array",
      description:
        "必須スキルのうち『◯年以上』等の必要経験年数が明記/読み取れる言語・技術を抽出する。" +
        "例: 『Java5年以上・TypeScript3年以上』→ [{\"skill\":\"Java\",\"years\":5},{\"skill\":\"TypeScript\",\"years\":3}]。" +
        "years は必要な最低年数。年数の指定が無いスキルは含めない。無ければ空配列。",
      items: {
        type: "object",
        properties: {
          skill: { type: "string" },
          years: { type: "number" },
        },
        required: ["skill", "years"],
        additionalProperties: false,
      },
    },
    rateMin: nullableInt,
    rateMax: nullableInt,
    remotePreference: nullableRemote,
    location: nullableString,
    startText: nullableString,
    description: nullableString,
    channelText: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description:
        "案件で『どこまで/誰まで提案できるか』の商流の「制限」を最優先で原文抽出する（提案可否を左右する表現）。" +
        "対象例: 『貴社/御社＋まで・所属・社員・正社員・プロパー・要員・フリーランス・直・のみ』（例『貴社プロパー／フリーランスまで』『貴社所属まで』『貴社要員まで』）、" +
        "『N社先まで』『1社先まで』『エンド直のみ』『個人事業主不可』『派遣契約必須』等。" +
        "重要: 単なる商流の「流れ図」（例『エンド⇔弊社』『エンド→A社→貴社』『商流：エンド直』）と、上記の「制限」が両方ある場合は、必ず「制限」の方を channelText に入れる（流れ図は入れない）。" +
        "制限表現が無く流れ図しか無い場合のみ、その流れを入れてよい。記載が無ければ null。",
    },
    supportFee: {
      type: "boolean",
      description:
        "支援費/営業支援費/中抜き等、支援費で商流を飛ばせる旨の記載があれば true、無ければ false。",
    },
  },
  required: [
    "title",
    "clientName",
    "requiredSkills",
    "requiredSkillYears",
    "rateMin",
    "rateMax",
    "remotePreference",
    "location",
    "startText",
    "description",
    "channelText",
    "supportFee",
  ],
} as const;

// スキルシート解析: 人材の構造化情報 ＋ サマリ文。
const SKILLSHEET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...TALENT_SCHEMA.properties,
    summary: { type: "string" },
  },
  required: [...TALENT_SCHEMA.required, "summary"],
} as const;

const CLASSIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["TALENT", "PROJECT", "IGNORE"] },
    reason: { type: "string" },
  },
  required: ["kind", "reason"],
} as const;

const MATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          talentId: { type: "string" },
          score: { type: "integer" },
          recommendation: {
            type: "string",
            enum: ["STRONG", "POSSIBLE", "WEAK", "UNFIT"],
          },
          strengths: {
            type: "array",
            items: { type: "string" },
            description:
              "案件の必須スキルのうち人材が満たすものを、必須スキルごとに具体的に書く（人材の一般的な強みではない）。年数が分かれば併記。例『必須Javaを5年で充足』『必須AWSを実務経験ありで充足』。",
          },
          concerns: {
            type: "array",
            items: { type: "string" },
            description:
              "案件の必須スキルのうち満たさない/年数が足りない/経歴に見当たらないものを具体的に書く。年数不足は数字で。例『必須Javaは5年以上だが人材は1年で不足』『必須Reactの経験が見当たらない』『必須スキルXの年数が不明』。",
          },
          reason: { type: "string" },
          channelOk: { type: "boolean" },
          channelNote: { type: "string" },
          locationOk: {
            type: "boolean",
            description:
              "勤務地（地域）と勤務形態（常駐/リモート/出社頻度）が両立するか。常駐・出社ありの案件は、人材の所在地域が案件勤務地の日本の地方区分（関東/近畿/中部/東北/北海道/中国四国/九州沖縄）と一致しなければ false（例: 大阪常駐(近畿)×東京在住(関東)→false）。フルリモート/基本リモートは地域不問で true。地方在住不可の案件は関東(首都圏)以外の人材は false。出社頻度が合わない場合も false。地域・勤務形態が不明なら true（無理に除外しない）。",
          },
          ageOk: {
            type: "boolean",
            description:
              "案件の年齢制限を満たすか。案件に年齢の上限/下限（例「〜40歳」「45歳まで」「40代以下」「20〜35歳」等）が明記されていて、人材の年齢がその範囲を外れる場合のみ false（厳しく判定する）。年齢制限の記載がない、または人材の年齢が不明な場合は true。",
          },
          nationalityOk: {
            type: "boolean",
            description:
              "案件の国籍要件を満たすか。案件に「日本国籍のみ」「外国籍不可」「国籍不問だが日本語ネイティブ必須」等の国籍制限が明記されていて、人材が外国籍（国籍が日本以外）の場合のみ false。国籍制限の記載がない、または人材の国籍が日本/不明の場合は true。",
          },
          rateOk: {
            type: "boolean",
            description:
              "単価が成立する見込みか。人材の希望最低単価が案件の想定単価上限を明確に超えている場合のみ false（例: 案件「〜70万」×人材「希望80万〜」→ false）。商流マージンや『単価応相談』『スキル見合い』で吸収できる範囲、双方の単価が近接・一部重なる、または案件/人材の単価が不明な場合は true（無理に除外しない）。",
          },
        },
        required: [
          "talentId",
          "score",
          "recommendation",
          "strengths",
          "concerns",
          "reason",
          "channelOk",
          "channelNote",
          "locationOk",
          "ageOk",
          "nationalityOk",
          "rateOk",
        ],
      },
    },
  },
  required: ["results"],
} as const;

// 各システムプロンプトは設定（プロンプト編集画面）で上書き可能。出典は ./prompts.ts。

// Convert API JSON (null) → TS interface (undefined where optional).
function denull<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const k of Object.keys(out)) {
    if (out[k] === null) out[k] = undefined;
  }
  return out as T;
}

export class AnthropicAIService implements AIService {
  private client: Anthropic;

  constructor() {
    // Reads ANTHROPIC_API_KEY from the environment.
    // 1呼び出しあたりの上限を明示する。SDK既定は timeout=600秒/maxRetries=2 のため、
    // 過負荷(529)や巨大スキャンPDFのdocument送信で1回の呼び出しが長時間ハングし、
    // 取込エンドポイントの maxDuration=300 を超えて関数ごと落ちる（→ページ打ち切り）事故を防ぐ。
    // 1メール=分類+解析の2回直列 × ページ内の複数メールでも300秒に収まるよう短めに設定。
    this.client = new Anthropic({
      timeout: Number(process.env.ANTHROPIC_TIMEOUT_MS ?? "45000") || 45000,
      maxRetries: Number(process.env.ANTHROPIC_MAX_RETRIES ?? "2") || 2,
    });
  }

  /** Build a user-content array: email text + any PDF attachments as document blocks. */
  private buildContent(
    rawEmail: string,
    attachments?: EmailAttachment[],
  ): Anthropic.ContentBlockParam[] {
    const text =
      rawEmail.length > MAX_EMAIL_CHARS
        ? rawEmail.slice(0, MAX_EMAIL_CHARS) + "\n…（以下省略）"
        : rawEmail;
    const content: Anthropic.ContentBlockParam[] = [{ type: "text", text }];
    for (const att of attachments ?? []) {
      const isPdf = att.mediaType === "application/pdf";
      // テキスト抽出済み（PDF/Excel/Word）なら安価なテキストで送る。
      if (att.text && att.text.trim().length > 40) {
        const body =
          att.text.length > MAX_EMAIL_CHARS
            ? att.text.slice(0, MAX_EMAIL_CHARS) + "\n…（以下省略）"
            : att.text;
        content.push({
          type: "text",
          text: `\n\n【添付: ${att.filename}】\n${body}`,
        });
      } else if (isPdf && att.dataBase64) {
        // 抽出できないPDF（スキャン等）→ 従来どおり document ブロックで送る。
        content.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: att.dataBase64,
          },
          title: att.filename,
        });
      }
      // Office で text 無し・dataBase64 無しはスキップ（Claudeは読めないため）。
    }
    return content;
  }

  private async extract<T>(
    system: string,
    schema: Record<string, unknown>,
    rawEmail: string,
    attachments?: EmailAttachment[],
  ): Promise<T> {
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: system,
          cache_control: { type: "ephemeral" }, // cache the stable instructions
        },
      ],
      output_config: {
        format: { type: "json_schema", schema },
      },
      messages: [{ role: "user", content: this.buildContent(rawEmail, attachments) }],
    });
    logUsage("extract", res.usage);

    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("AI応答にテキストが含まれていません");
    }
    return denull(JSON.parse(text.text)) as T;
  }

  async classifyEmail(
    rawEmail: string,
    _attachments?: EmailAttachment[],
    systemPrompt?: string,
  ): Promise<EmailClassification> {
    // 分類(人材/案件/対象外)は件名＋冒頭で判定できるので先頭だけ送る（入力トークン約8割減）。
    // 添付PDFも送らない（コスト削減・PDFを2回送る無駄を排除）。
    return this.extract<EmailClassification>(
      systemPrompt?.trim() || DEFAULT_CLASSIFY_PROMPT,
      CLASSIFY_SCHEMA as unknown as Record<string, unknown>,
      rawEmail.slice(0, CLASSIFY_MAX_CHARS),
    );
  }

  async parseTalentEmail(
    rawEmail: string,
    attachments?: EmailAttachment[],
    systemPrompt?: string,
  ): Promise<ParsedTalent> {
    return this.extract<ParsedTalent>(
      systemPrompt?.trim() || DEFAULT_TALENT_PROMPT,
      TALENT_SCHEMA,
      rawEmail,
      attachments,
    );
  }

  async parseProjectEmail(
    rawEmail: string,
    attachments?: EmailAttachment[],
    systemPrompt?: string,
  ): Promise<ParsedProject> {
    return this.extract<ParsedProject>(
      systemPrompt?.trim() || DEFAULT_PROJECT_PROMPT,
      PROJECT_SCHEMA,
      rawEmail,
      attachments,
    );
  }

  async generateProposal(input: ProposalInput, systemPrompt?: string): Promise<string> {
    const lines = [
      `案件名: ${input.projectTitle}`,
      input.projectClient ? `エンド/商流元: ${input.projectClient}` : "",
      `提案人材（イニシャル）: ${input.talentName}`,
      `スキル: ${input.talentSkills.join(" / ")}`,
      input.talentRate ? `希望単価: ${input.talentRate}` : "",
      input.matchReasons?.length
        ? `マッチング根拠:\n${input.matchReasons.map((r) => `- ${r}`).join("\n")}`
        : "",
      input.talentSummary ? `人材サマリ:\n${input.talentSummary}` : "",
    ].filter(Boolean);

    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: systemPrompt?.trim() || DEFAULT_PROPOSAL_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `以下の情報をもとに提案メール本文を作成してください。\n\n${lines.join("\n")}`,
        },
      ],
    });
    logUsage("proposal", res.usage);

    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("AI応答にテキストが含まれていません");
    }
    return text.text.trim();
  }

  async formatProjectBody(rawText: string, systemPrompt?: string): Promise<string> {
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: systemPrompt?.trim() || DEFAULT_PROJECT_EMAIL_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `以下の案件メール本文を、ルールに従って案内用に整形してください。\n\n${rawText.slice(0, MAX_EMAIL_CHARS)}`,
        },
      ],
    });
    logUsage("project-email", res.usage);
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("AI応答にテキストが含まれていません");
    }
    return text.text.trim();
  }

  async parseSkillSheet(
    rawText: string,
    attachments?: EmailAttachment[],
    systemPrompt?: string,
  ): Promise<ParsedSkillSheet> {
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: systemPrompt?.trim() || DEFAULT_SKILLSHEET_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: SKILLSHEET_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [{ role: "user", content: this.buildContent(rawText, attachments) }],
    });
    logUsage("skillsheet", res.usage);
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("AI応答にテキストが含まれていません");
    }
    return denull(JSON.parse(text.text)) as ParsedSkillSheet;
  }

  async analyzeRejections(input: string): Promise<string> {
    const system = `あなたはSES営業のマッチング精度を高めるアシスタントです。
以下は営業担当が「この人材×案件は送らない（差し戻し）」と判断したマッチと、その理由の一覧です。
これらに共通する「今後のマッチ判定で避けるべき／減点すべき傾向」を、簡潔な日本語の箇条書き（最大10項目）で抽出してください。

ルール:
- 個別の固有名詞（会社名・人名）は使わず、一般化した条件・傾向で書く。
- 「〜の場合は提案不可（除外）にする／大きく減点する」のように、判定に使える指示の形にする。
- 【重要】「既に充足」「他社で決定」「タイミングが合わない」「今回は見送り」等の
  “一回限り・状況依存”の理由は、繰り返し条件にできないため学習に含めない。
  人材と案件の属性（スキル不足/単価/商流/勤務地/年齢/国籍/経験年数 等）に基づく
  “繰り返し現れる確かな傾向”だけを抽出する。
- 確かな傾向が無ければ「特筆すべき傾向なし」とだけ書く。
- 箇条書き本文のみを出力（前置き・見出し・コードブロックは不要）。`;
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: [{ type: "text", text: system }],
      messages: [{ role: "user", content: input }],
    });
    logUsage("rejection-analysis", res.usage);
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("AI応答にテキストが含まれていません");
    }
    return text.text.trim();
  }

  async improveSkillSheet(currentText: string, systemPrompt?: string): Promise<string> {
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: systemPrompt?.trim() || DEFAULT_SKILLSHEET_IMPROVE_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: currentText }],
    });
    logUsage("skillsheet-improve", res.usage);
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("AI応答にテキストが含まれていません");
    }
    return text.text.trim();
  }

  async rankCandidates(
    project: MatchProjectInput,
    candidates: MatchCandidateInput[],
    systemPrompt?: string,
  ): Promise<RankedCandidate[]> {
    if (candidates.length === 0) return [];
    const system = systemPrompt?.trim() || DEFAULT_MATCH_PROMPT;
    const projectBlock = this.buildProjectBlock(project);

    // 候補を少人数のバッチに分割して判定する。1リクエストの出力を短く保ち、
    // 件数が多くても max_tokens で打ち切られない（=「Unterminated string」を防ぐ）。
    // バッチは独立・並列。1バッチが失敗しても他は残るので「全部落ちる」ことはない。
    const batches = chunk(candidates, MATCH_BATCH_SIZE);
    const settled = await Promise.allSettled(
      batches.map((b) => this.rankBatch(system, projectBlock, b)),
    );

    const results: RankedCandidate[] = [];
    let failed = 0;
    for (const s of settled) {
      if (s.status === "fulfilled") results.push(...s.value);
      else {
        failed++;
        console.error("[match] バッチ判定に失敗:", s.reason);
      }
    }
    // 全バッチが失敗したときだけエラー。一部成功なら取れた分を返す。
    if (results.length === 0 && failed > 0) {
      throw new Error(`AIマッチ判定に失敗しました（${failed}バッチ全てでエラー）`);
    }
    return results.sort((a, b) => b.score - a.score);
  }

  private buildProjectBlock(project: MatchProjectInput): string {
    return [
      `# 案件`,
      `タイトル: ${project.title}`,
      project.clientName ? `クライアント/商流: ${project.clientName}` : "",
      `必須スキル: ${formatSkillsWithYears(project.requiredSkills, project.requiredSkillYears, "年以上") || "(指定なし)"}`,
      `想定単価: ${project.rateMin ?? "?"}〜${project.rateMax ?? "?"}万`,
      project.remotePreference ? `リモート: ${project.remotePreference}` : "",
      project.location ? `勤務地/最寄り: ${project.location}` : "",
      project.startText ? `開始時期: ${project.startText}` : "",
      project.description ? `概要: ${project.description}` : "",
      `商流制限: ${project.channelText ?? "(記載なし)"}`,
      `支援費(商流を飛ばせる記載): ${project.supportFee ? "あり" : "なし/不明"}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  /** 少人数バッチを1リクエストで判定。出力が短いので打ち切りは実質起きない。 */
  private async rankBatch(
    system: string,
    projectBlock: string,
    candidates: MatchCandidateInput[],
  ): Promise<RankedCandidate[]> {
    const candidateBlock = candidates
      .map((c) =>
        [
          `- talentId: ${c.talentId}`,
          `  氏名: ${c.name} / 年齢: ${c.age ?? "?"} / 国籍: ${c.nationality ?? "?"} / 区分: ${c.talentType ?? "?"} / 所属: ${c.affiliation ?? "?"}`,
          `  スキル: ${formatSkillsWithYears(c.skills, c.skillYears) || "(不明)"}`,
          `  希望単価: ${c.desiredRateMin ?? "?"}〜${c.desiredRateMax ?? "?"}万`,
          `  リモート希望: ${c.remotePreference ?? "?"}`,
          `  稼働開始: ${c.availabilityText ?? "?"}`,
          `  最寄り: ${c.nearestStation ?? "?"}`,
          c.note ? `  メモ: ${c.note}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n");

    // 実APIコールはグローバルなリミッタ経由で同時実行数を抑える。
    const res = await matchLimiter(() =>
      this.client.messages.create({
        model: MODEL,
        max_tokens: 8192, // 少人数バッチなので十分。安全網として余裕を確保。
        system: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ],
        output_config: {
          format: {
            type: "json_schema",
            schema: MATCH_SCHEMA as unknown as Record<string, unknown>,
          },
        },
        messages: [
          {
            role: "user",
            content: `${projectBlock}\n\n# 候補人材（複数）\n${candidateBlock}`,
          },
        ],
      }),
    );

    logUsage("match", res.usage, candidates.length); // items = このバッチで判定した候補人数

    // 打ち切り時は曖昧なパースエラーにせず原因の分かるメッセージにする。
    if (res.stop_reason === "max_tokens") {
      throw new Error(
        `AI応答が出力上限(${res.usage?.output_tokens ?? "?"}トークン)で打ち切られました`,
      );
    }

    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("AI応答にテキストが含まれていません");
    }
    let parsed: { results?: RankedCandidate[] };
    try {
      parsed = JSON.parse(text.text) as { results?: RankedCandidate[] };
    } catch {
      throw new Error("AI応答のJSON解析に失敗しました（応答が不完全な可能性があります）");
    }
    return parsed.results ?? [];
  }
}
