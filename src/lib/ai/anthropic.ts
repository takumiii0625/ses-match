import Anthropic from "@anthropic-ai/sdk";
import type {
  AIService,
  ParsedTalent,
  ParsedProject,
  ProposalInput,
} from "./types";

// Real LLM implementation of AIService backed by the Claude API.
// - Structured JSON extraction via output_config.format (json_schema)
// - Prompt caching on the (stable) system prompt
// Selected when AI_PROVIDER=anthropic and ANTHROPIC_API_KEY is set (see ./index.ts).

// Default to the most capable model; allow override via env.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

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
    skills: { type: "array", items: { type: "string" } },
    mainSkills: { type: "array", items: { type: "string" } },
    desiredRateMin: nullableInt,
    desiredRateMax: nullableInt,
    remotePreference: nullableRemote,
    availabilityText: nullableString,
    nearestStation: nullableString,
    note: nullableString,
  },
  required: [
    "name",
    "age",
    "skills",
    "mainSkills",
    "desiredRateMin",
    "desiredRateMax",
    "remotePreference",
    "availabilityText",
    "nearestStation",
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
    rateMin: nullableInt,
    rateMax: nullableInt,
    remotePreference: nullableRemote,
    location: nullableString,
    startText: nullableString,
    description: nullableString,
  },
  required: [
    "title",
    "clientName",
    "requiredSkills",
    "rateMin",
    "rateMax",
    "remotePreference",
    "location",
    "startText",
    "description",
  ],
} as const;

const TALENT_SYSTEM = `あなたはSES業界の人材情報を扱うアシスタントです。
与えられたメール本文から、稼働可能なエンジニア（人材）の情報を抽出し、指定されたJSONスキーマに従って構造化してください。

ルール:
- 単価（desiredRateMin/Max）は月額・万円単位の整数。「80万」→80、「60〜80万」→min60/max80。記載がなければnull。
- remotePreference はメール記載に最も近いenum値を1つ選ぶ。判断できなければnull。
  FULL_REMOTE=フルリモート, MOSTLY_REMOTE=基本リモート, HYBRID=ハイブリッド,
  OFFICE_1〜4=週1〜4回出社可, ONSITE=常駐可
- skills は本文中の技術キーワード（言語/FW/クラウド/DB等）。mainSkills はそのうち主要な最大3件。
- availabilityText は稼働開始時期の原文（例「即日or6月〜」）。
- nearestStation は最寄り駅名のみ。
- note は人材の特徴を日本語で1〜2文に要約。
- 推測で値を捏造しない。不明な項目はnull、配列は空配列にする。`;

const PROJECT_SYSTEM = `あなたはSES業界の案件情報を扱うアシスタントです。
与えられたメール本文から、SES案件の情報を抽出し、指定されたJSONスキーマに従って構造化してください。

ルール:
- title は案件名/件名。clientName はエンド企業名や商流元。
- requiredSkills は必須・歓迎スキル（技術キーワード）。
- 単価（rateMin/Max）は月額・万円単位の整数。記載がなければnull。
- remotePreference はメール記載に最も近いenum値を1つ選ぶ。判断できなければnull。
  FULL_REMOTE=フルリモート, MOSTLY_REMOTE=基本リモート, HYBRID=ハイブリッド,
  OFFICE_1〜4=週1〜4回出社可, ONSITE=常駐可
- location は勤務地。startText は開始時期の原文。
- description は案件概要を日本語で1〜3文に要約。
- 推測で値を捏造しない。不明な項目はnull、配列は空配列にする。`;

const PROPOSAL_SYSTEM = `あなたはSES営業の提案メールを作成するアシスタントです。
提示された案件と人材の情報をもとに、丁寧で簡潔な日本語の提案メール本文を作成してください。

要件:
- 宛先の挨拶 → 案件名への言及 → 提案要員（イニシャル/スキル/単価）→ マッチング根拠 → 結びの依頼、の構成。
- ビジネスメールとして自然な敬語。誇張や事実の捏造はしない。提示された情報のみ使用する。
- 本文のみを出力し、件名やコードブロックは含めない。`;

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
    this.client = new Anthropic();
  }

  private async extract<T>(
    system: string,
    schema: Record<string, unknown>,
    rawEmail: string,
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
      messages: [{ role: "user", content: rawEmail }],
    });

    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("AI応答にテキストが含まれていません");
    }
    return denull(JSON.parse(text.text)) as T;
  }

  async parseTalentEmail(rawEmail: string): Promise<ParsedTalent> {
    return this.extract<ParsedTalent>(TALENT_SYSTEM, TALENT_SCHEMA, rawEmail);
  }

  async parseProjectEmail(rawEmail: string): Promise<ParsedProject> {
    return this.extract<ParsedProject>(PROJECT_SYSTEM, PROJECT_SCHEMA, rawEmail);
  }

  async generateProposal(input: ProposalInput): Promise<string> {
    const lines = [
      `案件名: ${input.projectTitle}`,
      input.projectClient ? `エンド/商流元: ${input.projectClient}` : "",
      `提案人材（イニシャル）: ${input.talentName}`,
      `スキル: ${input.talentSkills.join(" / ")}`,
      input.talentRate ? `希望単価: ${input.talentRate}` : "",
      input.matchReasons?.length
        ? `マッチング根拠:\n${input.matchReasons.map((r) => `- ${r}`).join("\n")}`
        : "",
    ].filter(Boolean);

    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: PROPOSAL_SYSTEM,
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

    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("AI応答にテキストが含まれていません");
    }
    return text.text.trim();
  }
}
