import type { LanguagePlugin, SymbolTable } from "./types.js";
import { TypeScriptPlugin } from "./typescript-plugin.js";

/**
 * Registry of language plugins keyed by file extension. Add new languages
 * (Python, Go, Java, ...) by implementing LanguagePlugin and registering
 * it here — the rest of the pipeline (graph-builder, policy-engine) only
 * depends on the language-agnostic SymbolTable shape.
 */
export class ParserRegistry {
  private readonly plugins = new Map<string, LanguagePlugin>();
  private readonly extensionIndex = new Map<string, LanguagePlugin>();

  register(plugin: LanguagePlugin): void {
    this.plugins.set(plugin.id, plugin);
    for (const ext of plugin.extensions) {
      this.extensionIndex.set(ext, plugin);
    }
  }

  pluginFor(filePath: string): LanguagePlugin | undefined {
    const ext = filePath.slice(filePath.lastIndexOf("."));
    return this.extensionIndex.get(ext);
  }

  async parseFile(filePath: string, sourceText: string): Promise<SymbolTable | null> {
    const plugin = this.pluginFor(filePath);
    if (!plugin) return null;
    await plugin.init();
    return plugin.parse(filePath, sourceText);
  }

  supportedExtensions(): string[] {
    return [...this.extensionIndex.keys()];
  }
}

let defaultRegistry: ParserRegistry | undefined;

/** Default registry pre-wired with the built-in TypeScript/JavaScript plugin. */
export function getDefaultParserRegistry(): ParserRegistry {
  if (defaultRegistry) return defaultRegistry;
  defaultRegistry = new ParserRegistry();
  defaultRegistry.register(new TypeScriptPlugin());
  return defaultRegistry;
}
