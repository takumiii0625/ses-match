import type { AIService } from "./types";
import { MockAIService } from "./mock";
import { AnthropicAIService } from "./anthropic";

// Provider selection. Set AI_PROVIDER + the matching API key in .env to use a
// real LLM; otherwise the built-in mock implementation is used.
let instance: AIService | null = null;

export function getAI(): AIService {
  if (instance) return instance;
  const provider = process.env.AI_PROVIDER ?? "mock";
  switch (provider) {
    case "anthropic":
      if (process.env.ANTHROPIC_API_KEY) {
        instance = new AnthropicAIService();
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
