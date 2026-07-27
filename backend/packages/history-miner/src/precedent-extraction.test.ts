import { describe, expect, it } from "vitest";
import {
  extractPrecedentFromCommit,
  extractPrecedentFromPullRequest,
  parseCommitConvention,
  pathsToGlobs,
} from "./precedent-extraction.js";

describe("parseCommitConvention", () => {
  it("parses type/scope/subject", () => {
    const result = parseCommitConvention("feat(auth): add SSO login");
    expect(result).toEqual({ type: "feat", scope: "auth", isBreaking: false, subject: "add SSO login" });
  });

  it("detects breaking-change marker via '!'", () => {
    const result = parseCommitConvention("feat!: drop legacy API");
    expect(result.isBreaking).toBe(true);
    expect(result.type).toBe("feat");
  });

  it("detects BREAKING CHANGE trailer even without '!'", () => {
    const message = "fix: patch race condition\n\nBREAKING CHANGE: removes old retry option";
    expect(parseCommitConvention(message).isBreaking).toBe(true);
  });

  it("falls back gracefully for non-conventional messages", () => {
    const result = parseCommitConvention("quick fix for build");
    expect(result.type).toBeNull();
    expect(result.subject).toBe("quick fix for build");
  });
});

describe("pathsToGlobs", () => {
  it("derives directory-level globs from touched files", () => {
    const globs = pathsToGlobs(["src/payments/charge.ts", "src/payments/refund.ts", "src/auth/login.ts"]);
    expect(globs).toContain("src/payments/**");
    expect(globs).toContain("src/auth/**");
  });

  it("keeps bare top-level files as-is", () => {
    expect(pathsToGlobs(["README.md"])).toEqual(["README.md"]);
  });
});

describe("extractPrecedentFromPullRequest", () => {
  it("infers a rejected outcome from revert language", () => {
    const precedent = extractPrecedentFromPullRequest({
      title: "Revert \"add risky cache\"",
      body: "This reverts the previous change due to production incident.",
      touchedFilePaths: ["src/cache/redis.ts"],
    });
    expect(precedent.outcome).toBe("rejected");
  });

  it("infers exception-granted from waiver language in review comments", () => {
    const precedent = extractPrecedentFromPullRequest({
      title: "Skip tests for hotfix",
      body: "Urgent hotfix.",
      touchedFilePaths: ["src/payments/charge.ts"],
      reviewComments: [{ body: "Exception granted given the incident severity." }],
    });
    expect(precedent.outcome).toBe("exception-granted");
  });

  it("defaults to merged when no special outcome language is present", () => {
    const precedent = extractPrecedentFromPullRequest({
      title: "Add pagination to listing endpoint",
      touchedFilePaths: ["src/api/list.ts"],
    });
    expect(precedent.outcome).toBe("merged");
  });

  it("carries PR number and related globs", () => {
    const precedent = extractPrecedentFromPullRequest({
      number: 42,
      title: "Improve billing retries",
      touchedFilePaths: ["src/billing/retry.ts"],
    });
    expect(precedent.sourcePrNumber).toBe("42");
    expect(precedent.relatedPathGlobs).toContain("src/billing/**");
  });
});

describe("extractPrecedentFromCommit", () => {
  it("marks revert-type commits as rejected precedents", () => {
    const precedent = extractPrecedentFromCommit({
      sha: "abc123",
      message: "revert: undo risky migration",
      touchedFilePaths: ["migrations/001.sql"],
    });
    expect(precedent.outcome).toBe("rejected");
    expect(precedent.tags).toContain("revert");
  });

  it("tags breaking-change commits", () => {
    const precedent = extractPrecedentFromCommit({
      sha: "def456",
      message: "feat!: remove deprecated endpoint",
      touchedFilePaths: ["src/api/legacy.ts"],
    });
    expect(precedent.tags).toContain("breaking-change");
  });
});
