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
import { OpenAIClassifierService } from "./openai";

// Provider selection. Set AI_PROVIDER + the matching API key in .env to use a
// real LLM; otherwise the built-in mock implementation is used.
let instance: AIService | null = null;

/** classifyEmail だけを別プロバイダに差し替える合成サービス。
 *  分類(テキストのみ・単純・高頻度)は安価な OpenAI に回し、抽出/マッチ/生成など
 *  精度・添付処理が効く処理は base(Anthropic)のまま使う。 */
class HybridAIService implements AIService {
  constructor(
    private base: AIService,
    private classifier: Pick<AIService, "classifyEmail">,
  ) {}

  classifyEmail(
    rawEmail: string,
    attachments?: EmailAttachment[],
    systemPrompt?: string,
  ): Promise<EmailClassification> {
    return this.classifier.classifyEmail(rawEmail, attachments, systemPrompt);
  }
  parseTalentEmail(
    rawEmail: string,
    attachments?: EmailAttachment[],
    systemPrompt?: string,
  ): Promise<ParsedTalent> {
    return this.base.parseTalentEmail(rawEmail, attachments, systemPrompt);
  }
  parseProjectEmail(
    rawEmail: string,
    attachments?: EmailAttachment[],
    systemPrompt?: string,
  ): Promise<ParsedProject> {
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

/** 分類だけ OpenAI に回すか。OPENAI_API_KEY があれば既定で有効。
 *  CLASSIFY_PROVIDER=anthropic で明示的に無効化（従来どおり全処理 Anthropic）できる。 */
function maybeWithOpenAIClassifier(base: AIService): AIService {
  if (process.env.CLASSIFY_PROVIDER === "anthropic") return base;
  if (!process.env.OPENAI_API_KEY) return base;
  return new HybridAIService(base, new OpenAIClassifierService());
}

export function getAI(): AIService {
  if (instance) return instance;
  const provider = process.env.AI_PROVIDER ?? "mock";
  switch (provider) {
    case "anthropic":
      if (process.env.ANTHROPIC_API_KEY) {
        // 分類のみ OpenAI に差し替え可（コスト削減）。他処理は Anthropic のまま。
        instance = maybeWithOpenAIClassifier(new AnthropicAIService());
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
