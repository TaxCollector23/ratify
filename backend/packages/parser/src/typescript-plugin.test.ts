import { describe, expect, it, beforeAll } from "vitest";
import { TypeScriptPlugin } from "./typescript-plugin.js";

describe("TypeScriptPlugin", () => {
  const plugin = new TypeScriptPlugin();

  beforeAll(async () => {
    await plugin.init();
  });

  it("extracts functions, classes, interfaces, imports and exports", async () => {
    const source = `
import { z } from "zod";
import type { Foo } from "./foo";

export interface Widget {
  id: string;
  count: number;
}

export enum Status {
  Active,
  Inactive,
}

export async function loadWidget(id: string): Promise<Widget> {
  if (!id) {
    throw new Error("missing id");
  }
  return { id, count: 0 };
}

export class WidgetService {
  private cache = new Map<string, Widget>();

  async get(id: string): Promise<Widget | undefined> {
    for (let i = 0; i < 3; i++) {
      if (this.cache.has(id)) {
        return this.cache.get(id);
      }
    }
    return undefined;
  }
}

export const DEFAULT_COUNT = 0;
`;

    const table = await plugin.parse("widget.ts", source);

    expect(table.hasSyntaxError).toBe(false);
    expect(table.language).toBe("typescript");

    const names = table.symbols.map((s) => s.name);
    expect(names).toContain("Widget");
    expect(names).toContain("Status");
    expect(names).toContain("loadWidget");
    expect(names).toContain("WidgetService");
    expect(names).toContain("DEFAULT_COUNT");

    const loadWidget = table.symbols.find((s) => s.name === "loadWidget");
    expect(loadWidget?.kind).toBe("function");
    expect(loadWidget?.isAsync).toBe(true);
    expect(loadWidget?.isExported).toBe(true);
    expect(loadWidget?.complexity.cyclomatic).toBeGreaterThanOrEqual(2); // base + if

    const widgetService = table.symbols.find((s) => s.name === "WidgetService");
    expect(widgetService?.kind).toBe("class");
    expect(widgetService?.members?.length).toBeGreaterThanOrEqual(1);
    const getMethod = widgetService?.members?.find((m) => m.name === "get");
    expect(getMethod?.complexity.cyclomatic).toBeGreaterThanOrEqual(3); // base + for + if

    expect(table.imports.some((i) => i.source === "zod" && i.importedNames.includes("z"))).toBe(true);
    expect(table.imports.some((i) => i.source === "./foo")).toBe(true);

    expect(table.publicApiSurface).toEqual(
      expect.arrayContaining(["Widget", "Status", "loadWidget", "WidgetService", "DEFAULT_COUNT"]),
    );
  });

  it("flags syntax errors instead of throwing", async () => {
    const table = await plugin.parse("broken.ts", "export function broken( {");
    expect(table.hasSyntaxError).toBe(true);
    expect(table.parseErrors.length).toBeGreaterThan(0);
  });
});
