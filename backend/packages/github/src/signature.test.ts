import { describe, expect, it } from "vitest";
import { computeGitHubSignature, verifyGitHubSignature } from "./signature.js";

describe("verifyGitHubSignature", () => {
  const secret = "test-webhook-secret";
  const payload = JSON.stringify({ action: "opened", number: 42 });

  it("accepts a correctly signed payload", () => {
    const signature = computeGitHubSignature(payload, secret);
    expect(verifyGitHubSignature({ payloadBody: payload, signatureHeader: signature, secret })).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const signature = computeGitHubSignature(payload, secret);
    const tampered = JSON.stringify({ action: "opened", number: 43 });
    expect(verifyGitHubSignature({ payloadBody: tampered, signatureHeader: signature, secret })).toBe(false);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const signature = computeGitHubSignature(payload, "wrong-secret");
    expect(verifyGitHubSignature({ payloadBody: payload, signatureHeader: signature, secret })).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyGitHubSignature({ payloadBody: payload, signatureHeader: null, secret })).toBe(false);
  });

  it("rejects a malformed signature header", () => {
    expect(verifyGitHubSignature({ payloadBody: payload, signatureHeader: "not-a-real-signature", secret })).toBe(
      false,
    );
  });

  it("is resilient to signature/body length mismatches without throwing", () => {
    expect(() =>
      verifyGitHubSignature({ payloadBody: payload, signatureHeader: "sha256=abc", secret }),
    ).not.toThrow();
  });
});
