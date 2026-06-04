import type { AIService } from "./types";
import { MockAIService } from "./mock";

// Provider selection. Today only the mock is wired; anthropic/openai
// implementations can be added and selected here without touching callers.
let instance: AIService | null = null;

export function getAI(): AIService {
  if (instance) return instance;
  const provider = process.env.AI_PROVIDER ?? "mock";
  switch (provider) {
    // case "anthropic": instance = new AnthropicAIService(); break;
    // case "openai":    instance = new OpenAIAIService();    break;
    default:
      instance = new MockAIService();
  }
  return instance;
}

export * from "./types";
