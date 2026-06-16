// AI service contract. Implementations: mock (default), anthropic, openai.
// Swap by setting AI_PROVIDER + the matching API key in .env.

export interface ParsedTalent {
  name?: string;
  age?: number;
  gender?: string; // MALE | FEMALE | OTHER
  skills: string[];
  mainSkills: string[];
  desiredRateMin?: number;
  desiredRateMax?: number;
  remotePreference?: string;
  availabilityText?: string;
  nearestStation?: string;
  affiliation?: string; // 所属（商流上の立場。例: "1社先社員" "プロパー" "個人事業主"）
  contactName?: string; // 紹介元の営業担当者名（メール署名・挨拶から。例「ハルミナの菅原です」→ 菅原）
  note?: string;
}

export interface ParsedProject {
  title?: string;
  clientName?: string;
  requiredSkills: string[];
  rateMin?: number;
  rateMax?: number;
  remotePreference?: string;
  location?: string;
  startText?: string;
  description?: string;
  channelText?: string; // 商流制限の原文/要約
  supportFee?: boolean; // 支援費で商流を飛ばせる旨の記載があるか
}

/** スキルシート解析の結果: 構造化情報 ＋ 提案用サマリ文。 */
export interface ParsedSkillSheet extends ParsedTalent {
  summary: string;
}

export interface ProposalInput {
  talentName: string;
  talentSkills: string[];
  talentRate?: string;
  talentSummary?: string; // スキルシートのサマリ文（あれば提案文の根拠に使う）
  projectTitle: string;
  projectClient?: string;
  matchReasons?: string[];
}

/** メール添付（PDF等）。LLMに渡して内容を読み取る。 */
export interface EmailAttachment {
  filename: string;
  mediaType: string; // 例: application/pdf
  dataBase64: string;
  text?: string; // PDFから抽出した本文テキスト（あればLLMにはテキストで送り、トークンを節約）
}

export type IngestKind = "TALENT" | "PROJECT" | "IGNORE";

export interface EmailClassification {
  kind: IngestKind;
  reason: string;
}

// ---- LLM matching (stage 2 of the funnel) ----

export type MatchRecommendation = "STRONG" | "POSSIBLE" | "WEAK" | "UNFIT";

/** Minimal project shape passed to the matcher. */
export interface MatchProjectInput {
  title: string;
  clientName?: string | null;
  requiredSkills: string[];
  rateMin?: number | null;
  rateMax?: number | null;
  remotePreference?: string | null;
  location?: string | null;
  startText?: string | null;
  description?: string | null;
  channelText?: string | null; // 商流制限
  supportFee?: boolean | null; // 支援費で商流を飛ばせる旨の記載
}

/** Minimal candidate shape passed to the matcher. */
export interface MatchCandidateInput {
  talentId: string;
  name: string;
  age?: number | null;
  nationality?: string | null; // 国籍（外国籍不可の案件の足切りに使用）
  talentType?: string | null;
  affiliation?: string | null; // 所属（商流上の立場。例: "1社先正社員"）
  skills: string[];
  desiredRateMin?: number | null;
  desiredRateMax?: number | null;
  remotePreference?: string | null;
  availabilityText?: string | null;
  nearestStation?: string | null;
  note?: string | null;
}

export interface RankedCandidate {
  talentId: string;
  score: number; // 0..100
  recommendation: MatchRecommendation;
  strengths: string[];
  concerns: string[];
  reason: string;
  channelOk: boolean; // 商流的に提案可能か（弊社が入ると+1。支援費があれば飛ばせる）
  channelNote: string; // 商流判定の理由（提案不可ならその根拠）
  locationOk?: boolean; // 勤務地/リモート条件が両立するか（false=不一致でマッチ除外）
  ageOk?: boolean; // 年齢制限を満たすか（false=制限オーバーでマッチ除外）
  nationalityOk?: boolean; // 国籍要件を満たすか（false=外国籍不可なのに外国籍でマッチ除外）
  rateOk?: boolean; // 単価が成立するか（false=人材希望が案件上限を明確に超過でマッチ除外）
}

export interface AIService {
  /** メールを 人材 / 案件 / 対象外 に分類（systemPrompt 指定で判定指示を上書き） */
  classifyEmail(
    rawEmail: string,
    attachments?: EmailAttachment[],
    systemPrompt?: string,
  ): Promise<EmailClassification>;
  /** メール本文(＋添付) → 人材の構造化データ（systemPrompt で上書き可） */
  parseTalentEmail(
    rawEmail: string,
    attachments?: EmailAttachment[],
    systemPrompt?: string,
  ): Promise<ParsedTalent>;
  /** メール本文(＋添付) → 案件の構造化データ（systemPrompt で上書き可） */
  parseProjectEmail(
    rawEmail: string,
    attachments?: EmailAttachment[],
    systemPrompt?: string,
  ): Promise<ParsedProject>;
  /** マッチング結果 → 提案メール文面（systemPrompt で上書き可） */
  generateProposal(input: ProposalInput, systemPrompt?: string): Promise<string>;
  /** 案件メール本文を案内用に整形（単価→スキル見合い・支払サイト/商流削除等。systemPromptで上書き可） */
  formatProjectBody(rawText: string, systemPrompt?: string): Promise<string>;
  /** 履歴書/スキルシート（テキスト＋添付）→ 提案用サマリ文＋構造化情報 */
  parseSkillSheet(
    rawText: string,
    attachments?: EmailAttachment[],
    systemPrompt?: string,
  ): Promise<ParsedSkillSheet>;
  /** 既存サマリ文を推敲（情報は足さず体裁のみ改善） */
  improveSkillSheet(currentText: string, systemPrompt?: string): Promise<string>;
  /** 案件＋候補人材リスト → LLMによるマッチ判定（高い順） */
  rankCandidates(
    project: MatchProjectInput,
    candidates: MatchCandidateInput[],
    systemPrompt?: string,
  ): Promise<RankedCandidate[]>;
}
