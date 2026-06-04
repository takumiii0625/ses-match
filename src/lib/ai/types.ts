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

export interface AIService {
  /** メール本文 → 人材の構造化データ */
  parseTalentEmail(rawEmail: string): Promise<ParsedTalent>;
  /** メール本文 → 案件の構造化データ */
  parseProjectEmail(rawEmail: string): Promise<ParsedProject>;
  /** マッチング結果 → 提案メール文面 */
  generateProposal(input: ProposalInput): Promise<string>;
}
