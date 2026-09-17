import type {
  AIService,
  EmailAttachment,
  EmailClassification,
  ParsedTalent,
  ParsedProject,
  ProposalInput,
  ParsedSkillSheet,
  MatchProjectInput,
  MatchCandidateInput,
  RankedCandidate,
} from "./types";
import { MockAIService } from "./mock";
import { AnthropicAIService } from "./anthropic";
import { OpenAIService, attachmentsNeedNativeDoc } from "./openai";

// Provider selection. Set AI_PROVIDER + the matching API key in .env to use a
// real LLM; otherwise the built-in mock implementation is used.
let instance: AIService | null = null;

/** 一部処理を OpenAI に差し替える合成サービス。
 *  - 分類(テキストのみ・単純・高頻度) は常に OpenAI。
 *  - 抽出(人材/案件) は「添付がテキスト化済み＝document送信不要」なら OpenAI、
 *    スキャンPDF等でネイティブdocument送信が要るものは精度重視で Anthropic に残す。
 *  - マッチ/生成など残りは Anthropic(base)のまま。 */
class HybridAIService implements AIService {
  constructor(
    private base: AIService,
    private openai: OpenAIService,
    private hybridExtract: boolean,
  ) {}

  classifyEmail(
    rawEmail: string,
    attachments?: EmailAttachment[],
    systemPrompt?: string,
  ): Promise<EmailClassification> {
    return this.openai.classifyEmail(rawEmail, attachments, systemPrompt);
  }
  parseTalentEmail(
    rawEmail: string,
    attachments?: EmailAttachment[],
    systemPrompt?: string,
  ): Promise<ParsedTalent> {
    // 添付にネイティブdocument送信が要る（スキャンPDF等）場合のみ Anthropic。
    if (this.hybridExtract && !attachmentsNeedNativeDoc(attachments)) {
      return this.openai.parseTalentEmail(rawEmail, attachments, systemPrompt);
    }
    return this.base.parseTalentEmail(rawEmail, attachments, systemPrompt);
  }
  parseProjectEmail(
    rawEmail: string,
    attachments?: EmailAttachment[],
    systemPrompt?: string,
  ): Promise<ParsedProject> {
    if (this.hybridExtract && !attachmentsNeedNativeDoc(attachments)) {
      return this.openai.parseProjectEmail(rawEmail, attachments, systemPrompt);
    }
    return this.base.parseProjectEmail(rawEmail, attachments, systemPrompt);
  }
  generateProposal(input: ProposalInput, systemPrompt?: string): Promise<string> {
    return this.base.generateProposal(input, systemPrompt);
  }
  formatProjectBody(rawText: string, systemPrompt?: string): Promise<string> {
    return this.base.formatProjectBody(rawText, systemPrompt);
  }
  parseSkillSheet(
    rawText: string,
    attachments?: EmailAttachment[],
    systemPrompt?: string,
  ): Promise<ParsedSkillSheet> {
    return this.base.parseSkillSheet(rawText, attachments, systemPrompt);
  }
  improveSkillSheet(currentText: string, systemPrompt?: string): Promise<string> {
    return this.base.improveSkillSheet(currentText, systemPrompt);
  }
  analyzeRejections(input: string): Promise<string> {
    return this.base.analyzeRejections(input);
  }
  rankCandidates(
    project: MatchProjectInput,
    candidates: MatchCandidateInput[],
    systemPrompt?: string,
  ): Promise<RankedCandidate[]> {
    return this.base.rankCandidates(project, candidates, systemPrompt);
  }
}

/** OpenAI に一部処理を回す合成を作る。OPENAI_API_KEY があれば既定で有効。
 *  - CLASSIFY_PROVIDER=anthropic: 分類も Anthropic に戻し、OpenAI差し替え自体を無効化。
 *  - EXTRACT_PROVIDER=anthropic: 抽出のOpenAI化だけ無効化（分類は引き続きOpenAI）。 */
function maybeWithOpenAI(base: AIService): AIService {
  if (process.env.CLASSIFY_PROVIDER === "anthropic") return base;
  if (!process.env.OPENAI_API_KEY) return base;
  const hybridExtract = process.env.EXTRACT_PROVIDER !== "anthropic";
  return new HybridAIService(base, new OpenAIService(), hybridExtract);
}

export function getAI(): AIService {
  if (instance) return instance;
  const provider = process.env.AI_PROVIDER ?? "mock";
  switch (provider) {
    case "anthropic":
      if (process.env.ANTHROPIC_API_KEY) {
        // 分類＋テキスト抽出を OpenAI に差し替え可（コスト削減）。document抽出/マッチは Anthropic。
        instance = maybeWithOpenAI(new AnthropicAIService());
      } else {
        console.warn(
          "[ai] AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set — falling back to mock.",
        );
        instance = new MockAIService();
      }
      break;
    // case "openai": instance = new OpenAIAIService(); break;
    default:
      instance = new MockAIService();
  }
  return instance;
}

export * from "./types";
