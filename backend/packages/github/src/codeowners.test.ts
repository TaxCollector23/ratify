import { describe, expect, it } from "vitest";
import { parseCodeowners } from "./codeowners.js";

describe("parseCodeowners", () => {
  it("parses standard entries and ignores comments/blank lines", () => {
    const content = `
# comment
* @global-owner
/src/payments/ @payments-team @finance-lead
docs/*.md @docs-team
`;
    const entries = parseCodeowners(content);
    expect(entries).toEqual([
      { pathGlob: "*", owners: ["@global-owner"] },
      { pathGlob: "src/payments/**", owners: ["@payments-team", "@finance-lead"] },
      { pathGlob: "docs/*.md", owners: ["@docs-team"] },
    ]);
  });
});
