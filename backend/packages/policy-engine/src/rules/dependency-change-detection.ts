import type { PolicyCheckContext, PolicyFinding } from "../types.js";

interface PackageJsonShape {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function safeParse(text: string | null): PackageJsonShape {
  if (!text) return {};
  try {
    return JSON.parse(text) as PackageJsonShape;
  } catch {
    return {};
  }
}

function diffDeps(
  baseDeps: Record<string, string> = {},
  headDeps: Record<string, string> = {},
): { added: string[]; removed: string[]; changed: { name: string; from: string; to: string }[] } {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: { name: string; from: string; to: string }[] = [];

  for (const [name, version] of Object.entries(headDeps)) {
    if (!(name in baseDeps)) added.push(name);
    else if (baseDeps[name] !== version) changed.push({ name, from: baseDeps[name]!, to: version });
  }
  for (const name of Object.keys(baseDeps)) {
    if (!(name in headDeps)) removed.push(name);
  }
  return { added, removed, changed };
}

/**
 * Detects dependency changes via a structural package.json diff (added,
 * removed, or version-changed dependencies). Major-version bumps are
 * flagged at higher severity as they're more likely to be breaking.
 */
export function dependencyChangeDetection(ctx: PolicyCheckContext): PolicyFinding[] {
  if (!ctx.packageJsonDiff) return [];

  const base = safeParse(ctx.packageJsonDiff.base);
  const head = safeParse(ctx.packageJsonDiff.head);

  const depSections: (keyof PackageJsonShape)[] = ["dependencies", "devDependencies", "peerDependencies"];
  const findings: PolicyFinding[] = [];

  for (const section of depSections) {
    const { added, removed, changed } = diffDeps(base[section], head[section]);
    if (added.length === 0 && removed.length === 0 && changed.length === 0) continue;

    const majorBumps = changed.filter((c) => isMajorBump(c.from, c.to));

    findings.push({
      ruleKey: "dependency-change-detection",
      title: `${section} changed: ${added.length} added, ${removed.length} removed, ${changed.length} version-changed`,
      description: [
        added.length ? `Added: ${added.join(", ")}` : null,
        removed.length ? `Removed: ${removed.join(", ")}` : null,
        changed.length ? `Changed: ${changed.map((c) => `${c.name} ${c.from} -> ${c.to}`).join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(". "),
      severity: majorBumps.length > 0 ? "medium" : "low",
      confidence: 0.95,
      filePath: "package.json",
      evidence: [
        {
          kind: "file-line",
          ref: "package.json",
          excerpt: JSON.stringify({ added, removed, changed }).slice(0, 1500),
        },
      ],
      remediation:
        majorBumps.length > 0
          ? `Review major-version bumps for breaking changes: ${majorBumps.map((c) => c.name).join(", ")}`
          : undefined,
    });
  }

  return findings;
}

function isMajorBump(from: string, to: string): boolean {
  const majorOf = (v: string) => Number.parseInt(v.replace(/^[^\d]*/, "").split(".")[0] ?? "0", 10);
  const a = majorOf(from);
  const b = majorOf(to);
  return Number.isFinite(a) && Number.isFinite(b) && b > a;
}
