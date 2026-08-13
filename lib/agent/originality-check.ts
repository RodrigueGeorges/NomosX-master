/**
 * Originality Check — detects close paraphrasing / plagiarism of source abstracts.
 *
 * Compares the generated analysis text against source abstracts using
 * trigram overlap (a fast, deterministic proxy for textual similarity).
 * High overlap → the analysis may be regurgitating source text rather than
 * synthesizing it.
 */

export interface OriginalityResult {
  /** 0-1 overall originality score (1 = fully original, 0 = pure copy) */
  originalityScore: number;
  /** Sections flagged with high source overlap */
  flaggedSections: Array<{
    section: string;
    sourceId: string;
    sourceTitle: string;
    overlap: number; // 0-1
    matchedSnippet: string;
  }>;
  /** Average trigram overlap across all sections */
  averageOverlap: number;
}

/**
 * Compute trigram set for a string.
 */
function trigrams(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const set = new Set<string>();
  for (let i = 0; i < words.length - 2; i++) {
    set.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return set;
}

/**
 * Jaccard similarity between two trigram sets.
 */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  return intersection / (a.size + b.size - intersection);
}

/**
 * Check originality of analysis text against source abstracts.
 *
 * @param analysisSections Map of section name → text
 * @param sources Array of sources with abstracts
 * @returns OriginalityResult
 */
export function checkOriginality(
  analysisSections: Record<string, string>,
  sources: Array<{ id: string; title: string; abstract?: string | null }>
): OriginalityResult {
  const flaggedSections: OriginalityResult["flaggedSections"] = [];
  const overlaps: number[] = [];

  // Precompute source trigrams
  const sourceTrigrams = sources
    .map((s) => ({
      id: s.id,
      title: s.title,
      trigrams: s.abstract ? trigrams(s.abstract.slice(0, 2000)) : new Set<string>(),
    }))
    .filter((s) => s.trigrams.size > 10); // skip sources with tiny abstracts

  for (const [sectionName, sectionText] of Object.entries(analysisSections)) {
    if (!sectionText || sectionText.length < 50) continue;
    // Strip citation tags and HTML
    const cleanText = sectionText
      .replace(/\[SRC-\d+\]/g, "")
      .replace(/\[MODEL-\d+\]/g, "")
      .replace(/<[^>]*>/g, "")
      .trim();
    const sectionTrigrams = trigrams(cleanText.slice(0, 5000));

    let maxOverlap = 0;
    let maxSource: typeof sourceTrigrams[number] | null = null;
    let matchedSnippet = "";

    for (const src of sourceTrigrams) {
      const overlap = jaccard(sectionTrigrams, src.trigrams);
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        maxSource = src;
        // Find a matching trigram for the snippet
        for (const t of sectionTrigrams) {
          if (src.trigrams.has(t)) {
            matchedSnippet = t;
            break;
          }
        }
      }
    }

    overlaps.push(maxOverlap);

    // Flag if overlap > 25% (significant textual borrowing)
    if (maxOverlap > 0.25 && maxSource) {
      flaggedSections.push({
        section: sectionName,
        sourceId: maxSource.id,
        sourceTitle: maxSource.title,
        overlap: maxOverlap,
        matchedSnippet,
      });
    }
  }

  const averageOverlap = overlaps.length > 0 ? overlaps.reduce((a, b) => a + b, 0) / overlaps.length : 0;
  const originalityScore = Math.max(0, 1 - averageOverlap * 2); // penalize overlap heavily

  return {
    originalityScore,
    flaggedSections,
    averageOverlap,
  };
}
