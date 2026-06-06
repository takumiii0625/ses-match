// AI service contract. Implementations: mock (default), anthropic, openai.
// Swap by setting AI_PROVIDER + the matching API key in .env.

export interface ParsedTalent {
  name?: string;
  age?: number;
  skills: string[];
  mainSkills: string[];
  desiredRateMin?: number;
  desiredRateMax?: number;
  remotePreference?: string;
  availabilityText?: string;
  nearestStation?: string;
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
}

export interface ProposalInput {
  talentName: string;
  talentSkills: string[];
  talentRate?: string;
  projectTitle: string;
  projectClient?: string;
  matchReasons?: string[];
}

/** メール添付（PDF等）。LLMに渡して内容を読み取る。 */
export interface EmailAttachment {
  filename: string;
  mediaType: string; // 例: application/pdf
  dataBase64: string;
}

export type IngestKind = "TALENT" | "PROJECT" | "IGNORE";

export interface EmailClassification {
  kind: IngestKind;
  reason: string;
}

export interface AIService {
  /** メールを 人材 / 案件 / 対象外 に分類 */
  classifyEmail(
    rawEmail: string,
    attachments?: EmailAttachment[],
  ): Promise<EmailClassification>;
  /** メール本文(＋添付) → 人材の構造化データ */
  parseTalentEmail(
    rawEmail: string,
    attachments?: EmailAttachment[],
  ): Promise<ParsedTalent>;
  /** メール本文(＋添付) → 案件の構造化データ */
  parseProjectEmail(
    rawEmail: string,
    attachments?: EmailAttachment[],
  ): Promise<ParsedProject>;
  /** マッチング結果 → 提案メール文面 */
  generateProposal(input: ProposalInput): Promise<string>;
}
