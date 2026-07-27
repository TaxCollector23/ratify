import type { PolicyCheckContext, PolicyFinding, PolicyRule } from "./types.js";
import { missingTestsForPaymentsPaths } from "./rules/missing-tests-for-payments-paths.js";
import { dependencyChangeDetection } from "./rules/dependency-change-detection.js";
import { breakingApiChangeHeuristic } from "./rules/breaking-api-change.js";
import { sensitiveAreaModification } from "./rules/sensitive-area-modification.js";
import { todoDebugCodeDetection } from "./rules/todo-debug-code.js";
import { codeownersBoundaryViolation } from "./rules/codeowners-boundary-violation.js";

/** All built-in deterministic rules, run before any LLM call. */
export const BUILTIN_RULES: PolicyRule[] = [
  missingTestsForPaymentsPaths,
  dependencyChangeDetection,
  breakingApiChangeHeuristic,
  sensitiveAreaModification,
  todoDebugCodeDetection,
  codeownersBoundaryViolation,
];

export interface PolicyEngineRunResult {
  findings: PolicyFinding[];
  ruleErrors: { ruleKey: string; message: string }[];
}

/**
 * Runs all registered rules against a PolicyCheckContext. Rules are
 * isolated: one throwing rule doesn't abort the others, and its failure
 * is recorded (never silently dropped) per the spec's failure-handling
 * requirement.
 */
export async function runPolicyEngine(
  ctx: PolicyCheckContext,
  rules: PolicyRule[] = BUILTIN_RULES,
): Promise<PolicyEngineRunResult> {
  const findings: PolicyFinding[] = [];
  const ruleErrors: { ruleKey: string; message: string }[] = [];

  for (const rule of rules) {
    try {
      const result = await rule(ctx);
      findings.push(...result);
    } catch (err) {
      ruleErrors.push({ ruleKey: rule.name || "unknown-rule", message: (err as Error).message });
    }
  }

  return { findings, ruleErrors };
}
