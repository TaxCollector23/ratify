import Anthropic from "@anthropic-ai/sdk";
import { RatifyError } from "@ratify/shared";
import { LlmReasoningOutputSchema, type LlmReasoningRequest } from "./schemas.js";
import type { LlmCallResult, LlmProvider } from "./provider.js";

export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
  maxOutputTokens?: number;
}

const REASONING_OUTPUT_TOOL_NAME = "emit_review_findings";

/**
 * Real Anthropic SDK client wrapper. Uses Claude's structured tool-use
 * mode to force schema-constrained JSON output — the model is given a
 * single tool whose input schema mirrors LlmReasoningOutputSchema, and we
 * require it to call that tool rather than reply in prose. Output is
 * still validated against the Zod schema before being trusted.
 *
 * This will not execute without a real ANTHROPIC_API_KEY, which is
 * expected in this sandboxed environment — the shape and call pattern
 * are what matters for the codebase to be production-ready.
 */
export class AnthropicLlmProvider implements LlmProvider {
  readonly id = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxOutputTokens: number;

  constructor(options: AnthropicProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model ?? "claude-sonnet-4-5";
    this.maxOutputTokens = options.maxOutputTokens ?? 4096;
  }

  async runStructuredReasoning(request: LlmReasoningRequest): Promise<LlmCallResult> {
    const startedAt = Date.now();

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxOutputTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(request) }],
      tools: [
        {
          name: REASONING_OUTPUT_TOOL_NAME,
          description: "Emit the structured PR review reasoning output. Always call this tool exactly once.",
          input_schema: REASONING_TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: REASONING_OUTPUT_TOOL_NAME },
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === REASONING_OUTPUT_TOOL_NAME,
    );

    if (!toolUse) {
      throw new RatifyError({
        code: "SCHEMA_CONSTRAINT_FAILED",
        message: "Model did not return the required structured tool call",
      });
    }

    const parsed = LlmReasoningOutputSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new RatifyError({
        code: "SCHEMA_CONSTRAINT_FAILED",
        message: "Model output failed schema validation",
        details: { issues: parsed.error.issues },
      });
    }

    return {
      output: parsed.data,
      rawText: JSON.stringify(toolUse.input),
      metadata: {
        provider: this.id,
        model: this.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs: Date.now() - startedAt,
      },
    };
  }
}

const SYSTEM_PROMPT = `You are Ratify's architectural review reasoner. You evaluate a pull request
against a repository's inferred engineering doctrine using ONLY the pre-assembled context provided:
diff summary, graph slice, retrieved docs/precedents, doctrine rules, deterministic policy findings,
and ownership context. You do not have raw repository access and must not invent facts not present
in the context. Focus on architectural judgment, abstraction quality, tradeoff interpretation, and
repo-specific norm inference — deterministic issues (missing tests, dependency changes, etc.) are
already handled and provided to you as deterministicFindings; do not re-derive them, only add
judgment-based findings. Always respond by calling the provided tool with structured output.`;

function buildUserPrompt(request: LlmReasoningRequest): string {
  return JSON.stringify(request, null, 2);
}

/** Mirrors LlmReasoningOutputSchema as a JSON Schema for Anthropic tool_use input_schema. */
const REASONING_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    overallAssessment: { type: "string" },
    overallConfidence: { type: "number", minimum: 0, maximum: 1 },
    riskSeverity: { type: "string", enum: ["info", "low", "medium", "high", "critical"] },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          severity: { type: "string", enum: ["info", "low", "medium", "high", "critical"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          filePath: { type: "string" },
          lineStart: { type: "number" },
          lineEnd: { type: "number" },
          evidence: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kind: {
                  type: "string",
                  enum: ["file-line", "pull-request", "commit", "review-comment", "doc", "adr", "graph-node"],
                },
                ref: { type: "string" },
                excerpt: { type: "string" },
                url: { type: "string" },
              },
              required: ["kind", "ref"],
            },
          },
          remediation: { type: "string" },
          falsePositiveLikelihood: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["title", "description", "severity", "confidence", "evidence"],
      },
    },
    recommendedActions: { type: "array", items: { type: "string" } },
    exceptionLikelihood: { type: "number", minimum: 0, maximum: 1 },
    reviewSummary: { type: "string" },
  },
  required: [
    "overallAssessment",
    "overallConfidence",
    "riskSeverity",
    "findings",
    "recommendedActions",
    "exceptionLikelihood",
    "reviewSummary",
  ],
};
