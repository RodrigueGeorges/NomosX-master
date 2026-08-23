/**
 * UFO — Unified Fact-Checking with Plug-and-Play Sources (NomosX)
 *
 * Inspired by:
 * - UFO (S15-06, AAAI 2026): A unified framework supporting multiple
 *   plug-and-play fact sources — human-written evidence, web search, LLM
 *   internal knowledge, structured databases, and knowledge graphs — with
 *   flexible source selection and reordering based on claim characteristics.
 *
 * Architecture:
 * 1. `selectSources()` — given a claim, picks the most appropriate source
 *    types based on lexical cues: numbers → database, entities →
 *    knowledge-graph, recent/temporal events → web, general knowledge → llm,
 *    and always includes human evidence when available.
 * 2. `verifyWithMultipleSources()` — verifies a single claim against a set of
 *    provided source contents, returning a supported/refuted/uncertain
 *    verdict with aggregated confidence and the contributing source types.
 * 3. `batchFactCheck()` — applies verification across many claims, fetching
 *   source content via a caller-supplied `sourceProvider` callback.
 *
 * Integration:
 * - lib/agent/fact-checker.ts: alternative backend that can route claims to
 *   the most relevant evidence sources instead of always querying all.
 * - lib/agent/citation-verifier.ts: UFO verdicts can feed CiteGuard.
 * - lib/agent/chain-verification.ts: per-claim verification questions can be
 *   answered via UFO's multi-source aggregation.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type FactSource = 'human' | 'web' | 'llm' | 'database' | 'knowledge-graph';

export interface FactCheckResult {
  claim: string;
  verdict: 'supported' | 'refuted' | 'uncertain';
  sources: FactSource[];
  confidence: number;
  evidence: string;
}

export interface UFOConfig {
  sources: FactSource[];
  minSources: number;
  confidenceThreshold: number;
}

export const DEFAULT_UFO_CONFIG: UFOConfig = {
  sources: ['human', 'web', 'llm', 'database', 'knowledge-graph'],
  minSources: 2,
  confidenceThreshold: 0.6,
};

// ─── Source selection ───────────────────────────────────────────────────────

const NUMBER_RE = /\b\d+(?:[.,]\d+)?\b/;
const DATE_RE = /\b(?:\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:\s+\d{4})?)\b/;
const RECENT_CUES = [
  'today', 'yesterday', 'this week', 'this month', 'this year', 'recent',
  'latest', 'current', 'now', 'just', 'breaking', 'announce', 'launch',
  'release', 'publish', 'report', 'update',
];
const ENTITY_RE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/;

/**
 * Selects the best source types for a given claim based on its lexical cues:
 * - Numbers/quantities → database (structured data is authoritative).
 * - Named entities (multi-word capitalized spans) → knowledge-graph.
 * - Recent-event cues → web (fresh information).
 * - General/definitional claims → llm (parametric knowledge).
 * - Human-written evidence is always preferred when available.
 */
export function selectSources(
  claim: string,
  availableSources: FactSource[],
): FactSource[] {
  const available = new Set(availableSources);
  const selected: FactSource[] = [];
  const lower = claim.toLowerCase();

  if (available.has('human')) selected.push('human');

  if (NUMBER_RE.test(claim) && available.has('database')) {
    selected.push('database');
  }

  if (ENTITY_RE.test(claim) && available.has('knowledge-graph')) {
    selected.push('knowledge-graph');
  }

  const isRecent = RECENT_CUES.some((cue) => lower.includes(cue)) || DATE_RE.test(claim);
  if (isRecent && available.has('web')) {
    selected.push('web');
  }

  // LLM as a fallback for general knowledge claims.
  if (available.has('llm')) {
    selected.push('llm');
  }

  // De-duplicate while preserving order, then filter to available sources.
  const seen = new Set<FactSource>();
  const result: FactSource[] = [];
  for (const s of selected) {
    if (seen.has(s)) continue;
    seen.add(s);
    result.push(s);
  }
  return result.length > 0 ? result : Array.from(available);
}

// ─── Single-claim verification ──────────────────────────────────────────────

const STOPWORDS = new Set<string>([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for',
  'with', 'as', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'this', 'that', 'these', 'those', 'it', 'its', 'at', 'from', 'which',
  'who', 'whom', 'whose', 'what', 'when', 'where', 'why', 'how', 'can',
  'could', 'should', 'would', 'may', 'might', 'must', 'shall', 'will',
  'do', 'does', 'did', 'has', 'have', 'had', 'not', 'no', 'so', 'than',
  'then', 'there', 'their', 'they', 'them', 'we', 'you', 'your', 'our',
  'i', 'me', 'my', 'if', 'about', 'into', 'over', 'under', 'after',
  'before', 'between', 'during', 'through', 'without', 'within',
]);

function contentTerms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function termOverlap(claim: string, source: string): number {
  const claimTerms = contentTerms(claim);
  if (claimTerms.length === 0) return 0;
  const sourceTokens = new Set(
    source.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2),
  );
  let found = 0;
  for (const term of claimTerms) {
    if (sourceTokens.has(term)) found += 1;
  }
  return found / claimTerms.length;
}

function hasContradictionSignal(claim: string, source: string): boolean {
  const negations = ['not', 'false', 'incorrect', 'wrong', 'denied', 'refuted', 'no '];
  const claimTerms = contentTerms(claim);
  if (claimTerms.length === 0) return false;
  const sourceLower = source.toLowerCase();
  const overlap = termOverlap(claim, source);
  if (overlap < 0.3) return false;
  return negations.some((n) => sourceLower.includes(` ${n}`));
}

/**
 * Verifies a claim against multiple provided source contents. Each source is
 * scored by lexical term overlap with the claim; sources with high overlap
 * and no negation cue count as supporting, sources with negation cues count
 * as refuting. The aggregate verdict is determined by the balance of
 * supporting vs refuting sources, subject to the configured minimum number
 * of sources and confidence threshold.
 */
export async function verifyWithMultipleSources(
  claim: string,
  sources: { type: FactSource; content: string }[],
  config: UFOConfig = DEFAULT_UFO_CONFIG,
): Promise<FactCheckResult> {
  if (sources.length === 0) {
    return {
      claim,
      verdict: 'uncertain',
      sources: [],
      confidence: 0,
      evidence: 'No sources provided.',
    };
  }

  let supporting = 0;
  let refuting = 0;
  let bestEvidence = '';
  let bestOverlap = 0;
  const usedSourceTypes: FactSource[] = [];

  for (const source of sources) {
    const overlap = termOverlap(claim, source.content);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestEvidence = source.content.slice(0, 300);
    }
    if (overlap < 0.2) continue;
    usedSourceTypes.push(source.type);
    if (hasContradictionSignal(claim, source.content)) {
      refuting += 1;
    } else {
      supporting += 1;
    }
  }

  const totalRelevant = supporting + refuting;
  const confidence =
    totalRelevant === 0 ? 0 : Math.abs(supporting - refuting) / totalRelevant;

  let verdict: FactCheckResult['verdict'];
  if (totalRelevant < config.minSources) {
    verdict = 'uncertain';
  } else if (refuting > supporting && confidence >= config.confidenceThreshold) {
    verdict = 'refuted';
  } else if (supporting > refuting && confidence >= config.confidenceThreshold) {
    verdict = 'supported';
  } else {
    verdict = 'uncertain';
  }

  const dedupedSources: FactSource[] = [];
  const seen = new Set<FactSource>();
  for (const s of usedSourceTypes) {
    if (seen.has(s)) continue;
    seen.add(s);
    dedupedSources.push(s);
  }

  const evidenceSummary =
    bestEvidence.length > 0
      ? bestEvidence
      : 'No strongly relevant source content found.';

  return {
    claim,
    verdict,
    sources: dedupedSources,
    confidence: Math.round(confidence * 100) / 100,
    evidence: evidenceSummary,
  };
}

// ─── Batch verification ─────────────────────────────────────────────────────

/**
 * Batch-verifies a list of claims. For each claim, the appropriate source
 * types are selected via `selectSources()`, content is fetched through the
 * caller-supplied `sourceProvider` callback, and the claim is verified via
 * `verifyWithMultipleSources()`. Failures from the provider are treated as
 * missing sources rather than fatal errors.
 */
export async function batchFactCheck(
  claims: string[],
  sourceProvider: (claim: string, type: FactSource) => Promise<string>,
  config: UFOConfig = DEFAULT_UFO_CONFIG,
): Promise<FactCheckResult[]> {
  const results: FactCheckResult[] = [];

  for (const claim of claims) {
    const sourceTypes = selectSources(claim, config.sources);
    const sources: { type: FactSource; content: string }[] = [];

    for (const type of sourceTypes) {
      try {
        const content = await sourceProvider(claim, type);
        if (content && content.trim().length > 0) {
          sources.push({ type, content });
        }
      } catch {
        // Provider failure for a single source type is non-fatal; continue.
      }
    }

    const result = await verifyWithMultipleSources(claim, sources, config);
    results.push(result);
  }

  return results;
}
