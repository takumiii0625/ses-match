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
} from "./types";
import { DEFAULT_MATCH_PROMPT } from "./prompts";

// Real LLM implementation of AIService backed by the Claude API.
// - Structured JSON extraction via output_config.format (json_schema)
// - Prompt caching on the (stable) system prompt
// Selected when AI_PROVIDER=anthropic and ANTHROPIC_API_KEY is set (see ./index.ts).

// Default to the most capable model; allow override via env.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

// マッチ判定の1リクエストあたり候補数。小さいほど1回の出力が短く、件数が多くても
// max_tokens で打ち切られない。バッチは並列・独立なので1つ失敗しても他は残る。
const MATCH_BATCH_SIZE = 5;

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

const CLASSIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["TALENT", "PROJECT", "IGNORE"] },
    reason: { type: "string" },
  },
  required: ["kind", "reason"],
} as const;

const CLASSIFY_SYSTEM = `あなたはSES業界のメールを仕分けるアシスタントです。
メール本文（と添付）が次のどれかを判定してください:
- TALENT: 稼働可能なエンジニア（人材）の紹介・売り込み。経歴書/スキルシートの提示など。
- PROJECT: 案件・求人の募集。必要スキル・単価・勤務地などの提示。
- IGNORE: 上記以外（営業案内、問い合わせ、自動返信、無関係なメールなど）。
判定理由を日本語で簡潔に述べてください。確信が持てない場合はIGNOREにする。`;

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
          strengths: { type: "array", items: { type: "string" } },
          concerns: { type: "array", items: { type: "string" } },
          reason: { type: "string" },
        },
        required: [
          "talentId",
          "score",
          "recommendation",
          "strengths",
          "concerns",
          "reason",
        ],
      },
    },
  },
  required: ["results"],
} as const;

// マッチ判定のシステムプロンプトは設定で上書き可能。出典は ./prompts.ts。

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

  /** Build a user-content array: email text + any PDF attachments as document blocks. */
  private buildContent(
    rawEmail: string,
    attachments?: EmailAttachment[],
  ): Anthropic.ContentBlockParam[] {
    const content: Anthropic.ContentBlockParam[] = [
      { type: "text", text: rawEmail },
    ];
    for (const att of attachments ?? []) {
      if (att.mediaType === "application/pdf") {
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

    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("AI応答にテキストが含まれていません");
    }
    return denull(JSON.parse(text.text)) as T;
  }

  async classifyEmail(
    rawEmail: string,
    attachments?: EmailAttachment[],
  ): Promise<EmailClassification> {
    return this.extract<EmailClassification>(
      CLASSIFY_SYSTEM,
      CLASSIFY_SCHEMA as unknown as Record<string, unknown>,
      rawEmail,
      attachments,
    );
  }

  async parseTalentEmail(
    rawEmail: string,
    attachments?: EmailAttachment[],
  ): Promise<ParsedTalent> {
    return this.extract<ParsedTalent>(
      TALENT_SYSTEM,
      TALENT_SCHEMA,
      rawEmail,
      attachments,
    );
  }

  async parseProjectEmail(
    rawEmail: string,
    attachments?: EmailAttachment[],
  ): Promise<ParsedProject> {
    return this.extract<ParsedProject>(
      PROJECT_SYSTEM,
      PROJECT_SCHEMA,
      rawEmail,
      attachments,
    );
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
      `必須スキル: ${project.requiredSkills.join(", ") || "(指定なし)"}`,
      `想定単価: ${project.rateMin ?? "?"}〜${project.rateMax ?? "?"}万`,
      project.remotePreference ? `リモート: ${project.remotePreference}` : "",
      project.location ? `勤務地/最寄り: ${project.location}` : "",
      project.startText ? `開始時期: ${project.startText}` : "",
      project.description ? `概要: ${project.description}` : "",
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
          `  氏名: ${c.name} / 年齢: ${c.age ?? "?"} / 区分: ${c.talentType ?? "?"}`,
          `  スキル: ${c.skills.join(", ") || "(不明)"}`,
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

    const res = await this.client.messages.create({
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
    });

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
