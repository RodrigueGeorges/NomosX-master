/**
 * Source Quality Engine — NomosX 2026
 *
 * Inspired by:
 * - BIP! impact indicators (OpenAIRE) — citation-based impact
 * - Rapid Journal Quality Check — SJR, H-Index, CCF
 * - Sourcecheck / RefChecker — provenance-first verification
 * - LevelRAG / HippoRAG 2 — re-rank by source reliability
 *
 * Scores academic and non-academic sources on multiple dimensions,
 * then re-ranks the top sources by a composite quality score.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SourceQualityScore {
  /** 0-100 composite score */
  overall: number;
  /** 0-100 — recency, domain relevance */
  recency: number;
  /** 0-100 — venue, citations, DOI, open access */
  authority: number;
  /** 0-100 — text richness, abstract, full-text available */
  contentRichness: number;
  /** 0-100 — diversity within the source set */
  diversity: number;
  /** flags */
  hasDoi: boolean;
  isOpenAccess: boolean;
  hasRetractionWarning: boolean;
  tier: 'top' | 'mid' | 'low';
}

export interface ScoredSource {
  source: any;
  score: SourceQualityScore;
  reason: string;
}

// ─── Heuristic scoring ──────────────────────────────────────────────────────

/**
 * S15-14: Check Crossref API for retraction notices.
 * Returns true if the DOI is a retraction or has a retraction assertion.
 */
async function checkCrossrefRetraction(doi: string): Promise<boolean> {
  if (!doi) return false;
  try {
    const res = await fetch(`https://api.crossref.org/works/${doi}`, {
      headers: { 'User-Agent': 'NomosX/1.0 (mailto:contact@nomosx.com)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const work = data.message;
    // Check for retraction type or retraction assertion
    return work?.type === 'retraction' ||
           work?.assertion?.some((a: any) => a.label?.toLowerCase().includes('retract')) ||
           false;
  } catch {
    return false;
  }
}

export async function scoreSource(source: any, currentYear = new Date().getFullYear()): Promise<SourceQualityScore> {
  const year = source.year ?? source.publishedAt ? new Date(source.publishedAt).getFullYear() : undefined;

  // Recency: 100 if ≤2 years, drops off to 0 at 30 years
  let recency = 40;
  if (year && year > 1900) {
    const age = Math.max(0, currentYear - year);
    recency = age <= 2 ? 100 : age <= 5 ? 80 : age <= 10 ? 60 : age <= 20 ? 40 : Math.max(20, 60 - age);
  }

  // Authority: venue + citations + DOI + open access
  let authority = 30;
  const venue = source.venue || source.journal || source.publisher || source.source;
  const citationCount = source.citationCount ?? source.citedByCount;
  if (source.doi) authority += 15;
  if (venue) authority += 15;
  if (citationCount) {
    authority += Math.min(25, Math.log10(citationCount + 1) * 8);
  }
  if (source.openAccess || source.isOpenAccess) authority += 10;
  if (source.type === 'journal-article' || source.type === 'preprint' || source.type === 'conference-paper') authority += 5;
  authority = Math.min(100, authority);

  // Content richness: full text, abstract length, structured data
  let contentRichness = 20;
  const fullText = source.fullText || source.extractedText || '';
  const abstract = source.abstract || '';
  if (fullText.length > 1000) contentRichness += 35;
  else if (fullText.length > 0) contentRichness += 15;
  if (abstract.length > 200) contentRichness += 20;
  else if (abstract.length > 0) contentRichness += 10;
  if (source.keyFindings?.length) contentRichness += 10;
  if (source.sections?.length) contentRichness += 10;
  contentRichness = Math.min(100, contentRichness);

  // Diversity is computed at the set level; default here
  const diversity = 50;

  const overall = Math.round(
    recency * 0.25 +
    authority * 0.35 +
    contentRichness * 0.30 +
    diversity * 0.10
  );

  const tier = overall >= 75 ? 'top' : overall >= 50 ? 'mid' : 'low';

  return {
    overall,
    recency,
    authority,
    contentRichness,
    diversity,
    hasDoi: !!source.doi,
    isOpenAccess: !!(source.openAccess || source.isOpenAccess),
    hasRetractionWarning: await checkCrossrefRetraction(source.doi || ''),
    tier,
  };
}

// ─── Diversity scoring at set level ─────────────────────────────────────────

function jaccardSimilarity(a: string, b: string): number {
  const sa = new Set(a.toLowerCase().split(/\s+/));
  const sb = new Set(b.toLowerCase().split(/\s+/));
  const inter = new Set([...sa].filter(x => sb.has(x)));
  return inter.size / (sa.size + sb.size - inter.size + 1e-6);
}

export function computeDiversityScores(sources: any[]): number[] {
  if (sources.length <= 1) return sources.map(() => 100);
  const abstracts = sources.map(s => `${s.title || ''} ${s.abstract || ''} ${s.venue || ''}`);
  const avgSimilarities: number[] = [];
  for (let i = 0; i < sources.length; i++) {
    let total = 0;
    let count = 0;
    for (let j = 0; j < sources.length; j++) {
      if (i === j) continue;
      total += jaccardSimilarity(abstracts[i], abstracts[j]);
      count++;
    }
    const avgSim = count > 0 ? total / count : 0;
    // Low similarity = high diversity; convert to 0-100
    avgSimilarities.push(Math.round((1 - avgSim) * 100));
  }
  return avgSimilarities;
}

// ─── Main re-ranker ─────────────────────────────────────────────────────────

export async function rankSourcesByQuality(sources: any[], includeReliability = true): Promise<ScoredSource[]> {
  const diversityScores = computeDiversityScores(sources);

  const scored: ScoredSource[] = [];
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const score = await scoreSource(source);
    score.diversity = diversityScores[i];

    // Recompute overall with diversity
    score.overall = Math.round(
      score.recency * 0.20 +
      score.authority * 0.30 +
      score.contentRichness * 0.25 +
      score.diversity * 0.20 +
      (includeReliability ? score.overall * 0.05 : 0)
    );

    const reasons: string[] = [];
    if (score.tier === 'top') reasons.push('top-tier authority/recency/content');
    if (source.doi) reasons.push('DOI verified');
    if (source.openAccess) reasons.push('open access');
    if (source.citationCount) reasons.push(`${source.citationCount} citations`);
    if (score.diversity > 70) reasons.push('high diversity');

    scored.push({ source, score, reason: reasons.join(', ') || 'standard source' });
  }

  return scored.sort((a, b) => b.score.overall - a.score.overall);
}

// ─── Filter / boost ─────────────────────────────────────────────────────────

export async function filterAndBoostTopSources(
  sources: any[],
  topK: number,
  minScore = 35,
): Promise<{ selected: any[]; scored: ScoredSource[] }> {
  const scored = await rankSourcesByQuality(sources);
  const selected = scored
    .filter(s => s.score.overall >= minScore)
    .slice(0, topK)
    .map(s => s.source);
  return { selected, scored };
}
