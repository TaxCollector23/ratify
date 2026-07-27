import type { LlmReasoningOutput, LlmReasoningRequest } from "./schemas.js";

export interface LlmCallMetadata {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface LlmCallResult {
  output: LlmReasoningOutput;
  metadata: LlmCallMetadata;
  rawText: string;
}

/**
 * Provider-agnostic interface for the llm-reasoner. Concrete
 * implementations: AnthropicLlmProvider (real SDK) and MockLlmProvider
 * (deterministic, for tests / offline dev). Injected via constructor so
 * the reasoning pipeline is fully testable without live credentials.
 */
export interface LlmProvider {
  readonly id: string;
  runStructuredReasoning(request: LlmReasoningRequest): Promise<LlmCallResult>;
}
