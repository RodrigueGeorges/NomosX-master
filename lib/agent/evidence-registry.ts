/**
 * NomosX Stable Evidence IDs
 *
 * Inspired by geodocs.dev + EviReport (ACL 2026).
 *
 * Instead of using positional [SRC-N] indices that shift when sources are
 * added/removed, this module assigns stable evidence IDs [E1], [E2]...
 * with a bidirectional mapping table.
 *
 * Benefits:
 * - Adding/removing a source doesn't break existing citations
 * - Citations can be traced back to exact source spans
 * - Enables evidence deduplication (same source cited multiple times)
 *
 * Usage:
 * 1. Create an EvidenceRegistry from the source list
 * 2. Replace [SRC-N] in analysis text with [E-N] using the registry
 * 3. Store the registry alongside the brief for post-hoc verification
 */

export interface EvidenceEntry {
  evidenceId: string;       // [E1], [E2], etc.
  sourceId: string;         // Database ID of the source
  sourceIndex: number;      // Original 0-based index (for backward compat)
  title: string;
  doi?: string;
  provider: string;
  citationCount: number;    // How many times this evidence is cited
}

export interface EvidenceRegistry {
  entries: EvidenceEntry[];
  sourceToEvidence: Map<string, string>;  // sourceId → evidenceId
  indexToEvidence: Map<number, string>;   // 0-based index → evidenceId
  evidenceToSource: Map<string, EvidenceEntry>; // evidenceId → entry
}

/**
 * Create a stable evidence registry from a list of sources.
 * Each source gets a unique [E-N] ID that won't change if sources are reordered.
 */
export function createEvidenceRegistry(sources: any[]): EvidenceRegistry {
  const entries: EvidenceEntry[] = [];
  const sourceToEvidence = new Map<string, string>();
  const indexToEvidence = new Map<number, string>();
  const evidenceToSource = new Map<string, EvidenceEntry>();

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const evidenceId = `E${i + 1}`;
    const entry: EvidenceEntry = {
      evidenceId,
      sourceId: source.id || `unknown-${i}`,
      sourceIndex: i,
      title: source.title || `Source ${i + 1}`,
      doi: source.doi,
      provider: source.provider || 'unknown',
      citationCount: 0,
    };
    entries.push(entry);
    sourceToEvidence.set(entry.sourceId, evidenceId);
    indexToEvidence.set(i, evidenceId);
    evidenceToSource.set(evidenceId, entry);
  }

  return { entries, sourceToEvidence, indexToEvidence, evidenceToSource };
}

/**
 * Replace [SRC-N] citations in text with stable [E-N] evidence IDs.
 * SRC-1 (1-based) → E1, SRC-2 → E2, etc.
 *
 * Also handles HTML <sup> citation tags.
 */
export function replaceSrcWithEvidenceIds(
  html: string,
  registry: EvidenceRegistry,
): string {
  // Replace [SRC-N] text citations
  let result = html.replace(/\[SRC-(\d+)\]/g, (match, numStr: string) => {
    const num = parseInt(numStr);
    const evidenceId = registry.indexToEvidence.get(num - 1);
    if (evidenceId) {
      // Track citation count
      const entry = registry.evidenceToSource.get(evidenceId);
      if (entry) entry.citationCount++;
      return `[${evidenceId}]`;
    }
    return match; // Keep original if no mapping
  });

  // Replace HTML <sup class="cite"> tags
  result = result.replace(
    /<sup class="cite"><a href="#ref-(\d+)"[^>]*>\s*\d+\s*<\/a><\/sup>/gi,
    (match, numStr: string) => {
      const num = parseInt(numStr);
      const evidenceId = registry.indexToEvidence.get(num - 1);
      if (evidenceId) {
        const entry = registry.evidenceToSource.get(evidenceId);
        if (entry) entry.citationCount++;
        return `<sup class="cite"><a href="#ref-${num}" data-evidence="${evidenceId}">${evidenceId}</a></sup>`;
      }
      return match;
    },
  );

  return result;
}

/**
 * Resolve an evidence ID back to its source entry.
 */
export function resolveEvidenceId(
  evidenceId: string,
  registry: EvidenceRegistry,
): EvidenceEntry | undefined {
  return registry.evidenceToSource.get(evidenceId);
}

/**
 * Get citation statistics from the registry.
 */
export function getCitationStats(registry: EvidenceRegistry): {
  totalEvidence: number;
  citedEvidence: number;
  uncitedEvidence: number;
  citationDistribution: Array<{ evidenceId: string; count: number }>;
} {
  const cited = registry.entries.filter(e => e.citationCount > 0);
  const uncited = registry.entries.filter(e => e.citationCount === 0);
  return {
    totalEvidence: registry.entries.length,
    citedEvidence: cited.length,
    uncitedEvidence: uncited.length,
    citationDistribution: registry.entries
      .filter(e => e.citationCount > 0)
      .sort((a, b) => b.citationCount - a.citationCount)
      .map(e => ({ evidenceId: e.evidenceId, count: e.citationCount })),
  };
}
