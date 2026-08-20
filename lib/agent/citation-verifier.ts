/**
 * NomosX Citation Verifier — Semantic Citation Validation
 * 
 * Goes beyond the old citationGuard (which only checks [SRC-N] format validity).
 * This agent verifies that each citation ACTUALLY SUPPORTS the claim it's attached to.
 * 
 * Process:
 * 1. Parse all [SRC-N] citations from the analysis text
 * 2. Extract the claim/sentence surrounding each citation
 * 3. Compare claim semantics against the source's actual content
 * 4. Flag misattributions, unsupported claims, and cherry-picking
 * 5. Produce a verification report with confidence scores
 * 
 * This is what separates a real think tank from a content generator.
 */

import { callLLM, type LLMFamily } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import { cosineSimilarity, embedText } from './semantic-engine';
import Sentry from '@sentry/nextjs';

// ============================================================================
// TYPES
// ============================================================================

export interface CitationInstance {
  srcIndex: number;           // The N in [SRC-N]
  claim: string;              // The sentence/clause containing the citation
  context: string;            // Surrounding paragraph for context
  position: number;           // Character position in text
}

export interface CitationVerification {
  srcIndex: number;
  claim: string;
  sourceTitle: string;
  sourceAbstract: string;
  verdict: "supported" | "partially_supported" | "unsupported" | "misattributed" | "unverifiable";
  confidence: number;         // 0-100
  semanticSimilarity: number; // 0-1 cosine similarity between claim and source
  explanation: string;
  suggestedFix?: string;      // How to fix if problematic
  evidenceSnippets?: string[]; // Exact passages from the source that support or contradict
  sourceReliability?: number; // 0-100 estimate of source trustworthiness
}

export interface VerificationReport {
  totalCitations: number;
  uniqueSources: number;
  supported: number;
  partiallySup: number;
  unsupported: number;
  misattributed: number;
  unverifiable: number;
  overallIntegrity: number;   // 0-100 composite score
  verifications: CitationVerification[];
  flaggedClaims: CitationVerification[];  // Only problematic ones
  recommendations: string[];
  costUsd: number;
}

// ============================================================================
// CITATION EXTRACTION
// ============================================================================

/**
 * Parse all [SRC-N] citations from text and extract surrounding context.
 */
export function extractCitations(text: string): CitationInstance[] {
  const citations: CitationInstance[] = [];
  // First normalize citation variants to [SRC-N] format:
  // "(SRC-2, SRC-8)" → "[SRC-2][SRC-8]", "SRC-3" → "[SRC-3]"
  // Also handle HTML-escaped sup tags and [E-N] evidence IDs.
  const normalized = text
    .replace(/<sup class="cite"><a href="#ref-(\d+)"[^>]*>\s*(\d+)\s*<\/a><\/sup>/gi, "[SRC-$1]")
    .replace(/<sup class="cite"><a href="#ref-(\d+)"[^>]*>([\s\S]*?)<\/a><\/sup>/gi, "[SRC-$1]")
    // Handle HTML-escaped sup tags (safety net for escaped renderers)
    .replace(/&lt;sup class=&quot;cite&quot;&gt;&lt;a href=&quot;#ref-(\d+)&quot;[^&]*&gt;[^&]*&lt;\/a&gt;&lt;\/sup&gt;/gi, "[SRC-$1]")
    // Normalize [E-N] evidence IDs to [SRC-N] (strategic reports use E-N format)
    .replace(/\[E(\d+)\]/g, "[SRC-$1]")
    .replace(/\(SRC-(\d+)(?:\s*,\s*SRC-(\d+))*\)/g, (match, ...nums) => {
      const refs = match.match(/SRC-(\d+)/g) || [];
      return refs.map(r => `[${r}]`).join('');
    })
    .replace(/(?<!\[)SRC-(\d+)(?!\])/g, '[SRC-$1]');
  const pattern = /\[SRC-(\d+)\]/g;
  let match;

  while ((match = pattern.exec(normalized)) !== null) {
    const srcIndex = parseInt(match[1]);
    const position = match.index;

    // Extract the sentence containing the citation
    const beforeText = normalized.slice(Math.max(0, position - 500), position);
    const afterText = normalized.slice(position + match[0].length, Math.min(normalized.length, position + match[0].length + 200));

    // Find sentence boundaries
    const sentenceStart = Math.max(
      beforeText.lastIndexOf('.') + 1,
      beforeText.lastIndexOf('!') + 1,
      beforeText.lastIndexOf('?') + 1,
      beforeText.lastIndexOf('\n') + 1,
      0
    );
    const sentenceEnd = afterText.search(/[.!?\n]/);
    const claim = (
      beforeText.slice(sentenceStart).trim() +
      ' ' +
      afterText.slice(0, sentenceEnd > 0 ? sentenceEnd : 100).trim()
    ).trim();

    // Broader context (paragraph level)
    const paraStart = Math.max(beforeText.lastIndexOf('\n\n') + 2, 0);
    const paraEnd = afterText.indexOf('\n\n');
    const context = (
      beforeText.slice(paraStart).trim() +
      ' ' +
      afterText.slice(0, paraEnd > 0 ? paraEnd : 300).trim()
    ).trim();

    citations.push({
      srcIndex,
      claim: claim.replace(/\[SRC-\d+\]/g, '').trim(),
      context: context.replace(/\[SRC-\d+\]/g, '').trim(),
      position,
    });
  }

  return citations;
}

// ============================================================================
// PASSAGE-LEVEL GROUNDING (OpenScholar-style)
// ============================================================================

const MIN_PASSAGE_LEN = 80;
const MAX_PASSAGE_LEN = 600;

function splitIntoPassages(text: string): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim().length > 30);
  const passages: string[] = [];
  let current = '';
  for (const s of sentences) {
    current += (current ? ' ' : '') + s;
    if (current.length >= MIN_PASSAGE_LEN) {
      passages.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) passages.push(current.trim());
  return passages;
}

async function findRelevantPassages(
  claim: string,
  fullText: string,
  topK = 3,
): Promise<{ passage: string; score: number }[]> {
  const passages = splitIntoPassages(fullText);
  if (passages.length === 0) return [];
  try {
    const [claimEmb, ...passageEmbs] = await Promise.all([
      embedText(claim),
      ...passages.map(p => embedText(p)),
    ]);
    const scored = passages.map((p, i) => ({
      passage: p,
      score: cosineSimilarity(claimEmb, passageEmbs[i]),
    }));
    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  } catch {
    return [];
  }
}

function computeSourceReliability(source: any): number {
  let score = 50;
  if (source.year && new Date().getFullYear() - source.year <= 3) score += 15;
  else if (source.year && new Date().getFullYear() - source.year <= 7) score += 5;
  if (source.doi) score += 10;
  if (source.venue || source.journal) score += 10;
  if (source.citationCount && source.citationCount > 50) score += 15;
  else if (source.citationCount && source.citationCount > 10) score += 5;
  if (source.openAccess) score += 5;
  return Math.min(100, score);
}

// ============================================================================
// SEMANTIC VERIFICATION
// ============================================================================

/**
 * Verify a single citation using both semantic similarity and LLM judgment.
 * OpenScholar-style: retrieve the most relevant passages from the full text
 * and ask the LLM to judge entailment at the sentence/paragraph level.
 */
async function verifySingleCitation(
  citation: CitationInstance,
  source: any,
  producerFamily?: LLMFamily,
  readings?: any[],
): Promise<CitationVerification> {
  // Use full-text from READER V3 when available — abstracts alone miss specific numbers/quotes
  const reading = readings?.find((r: any) => r.sourceId === source.id);
  const fullText = reading?.extractedText || (source as any).fullText;
  const sourceAbstract = (source.abstract || '').slice(0, 800);

  // Step 1: Retrieve the most relevant passages from the full text (OpenScholar-style)
  let relevantPassages: { passage: string; score: number }[] = [];
  let sourceContent: string;
  if (fullText && fullText.length > 100) {
    relevantPassages = await findRelevantPassages(citation.claim, fullText, 3);
    sourceContent = relevantPassages.length
      ? relevantPassages.map(p => p.passage).join('\n\n')
      : fullText.slice(0, 4000);
  } else {
    sourceContent = `${source.title}\n${sourceAbstract}`.trim();
  }

  // Step 2: Semantic similarity (fast, cheap)
  let semanticSim = 0;
  try {
    const [claimEmb, sourceEmb] = await Promise.all([
      embedText(citation.claim),
      source.embeddings?.length > 0
        ? Promise.resolve(source.embeddings)
        : embedText(sourceContent),
    ]);
    semanticSim = cosineSimilarity(claimEmb, sourceEmb);
  } catch {
    // If embedding fails, continue with LLM-only verification
    semanticSim = -1;
  }

  // Step 3: LLM NLI verification (deep, accurate, at passage level)
  try {
    const response = await callLLM({
      messages: [{
        role: "user",
        content: `You are a citation verification expert working at the level of OpenScholar. Your task is to determine whether the cited source actually supports the exact claim made.

CLAIM IN THE ANALYSIS:
"${citation.claim}"

BROADER CONTEXT FROM THE ANALYSIS:
"${citation.context.slice(0, 500)}"

CITED SOURCE:
Title: ${source.title}
Year: ${source.year || "N/A"}
Reliability estimate: ${computeSourceReliability(source)}/100

MOST RELEVANT PASSAGES FROM THE SOURCE (retrieved by semantic search):
${relevantPassages.length
  ? relevantPassages.map((p, i) => `--- Passage ${i + 1} (similarity ${(p.score * 100).toFixed(1)}%) ---\n${p.passage}`).join('\n\n')
  : (sourceContent.length ? `Source content:\n${sourceContent.slice(0, 3000)}` : 'No content available')}

${sourceAbstract ? `ABSTRACT:\n${sourceAbstract}` : ''}

INSTRUCTIONS:
1. Find the exact sentence or passage in the source that addresses the claim.
2. If the claim is clearly supported by the source, return "supported".
3. If the source only loosely or partially supports the claim (e.g., overstates a result, mixes correlation with causation, extrapolates beyond the source), return "partially_supported".
4. If the source does not support the claim, return "unsupported".
5. If the source contradicts the claim, return "misattributed".
6. If the source content is missing or too thin to decide, return "unverifiable".

Return JSON:
{
  "verdict": "supported|partially_supported|unsupported|misattributed|unverifiable",
  "confidence": 0-100,
  "explanation": "Why this verdict — quote or refer to the specific passage",
  "suggestedFix": "How to fix if problematic (null if supported)",
  "evidenceSnippets": ["exact supporting or contradicting passage(s) from the source"]
}`
      }],
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 1800,
      enableCache: true,
      task: 'citation_verification',
      producerFamily,
    });

    const result = parseJson<any>(response.content);
    if (!result) throw new SyntaxError('Citation verifier: failed to parse LLM JSON');

    return {
      srcIndex: citation.srcIndex,
      claim: citation.claim,
      sourceTitle: source.title,
      sourceAbstract: sourceAbstract.slice(0, 200),
      verdict: result.verdict || "unverifiable",
      confidence: result.confidence || 50,
      semanticSimilarity: semanticSim,
      explanation: result.explanation || "",
      suggestedFix: result.suggestedFix || undefined,
      evidenceSnippets: Array.isArray(result.evidenceSnippets) ? result.evidenceSnippets : [],
      sourceReliability: computeSourceReliability(source),
    };
  } catch (error: any) {
    console.warn(`[CitationVerifier] LLM verification failed for SRC-${citation.srcIndex}: ${error.message}`);
    Sentry?.captureException?.(error);
    return {
      srcIndex: citation.srcIndex,
      claim: citation.claim,
      sourceTitle: source.title,
      sourceAbstract: sourceAbstract.slice(0, 200),
      verdict: "unverifiable",
      confidence: 0,
      semanticSimilarity: semanticSim,
      explanation: `Verification failed: ${error.message}`,
      evidenceSnippets: relevantPassages.map(p => p.passage),
      sourceReliability: computeSourceReliability(source),
    };
  }
}

// ============================================================================
// MAIN: VERIFY ALL CITATIONS
// ============================================================================

/**
 * Verify all citations in an analysis against their sources.
 * 
 * @param analysisText - The full analysis HTML/text containing [SRC-N] citations
 * @param sources - Array of sources (index 0 = SRC-1, index 1 = SRC-2, etc.)
 * @param options - Configuration
 */
export async function verifyCitations(
  analysisText: string,
  sources: any[],
  options: {
    maxConcurrency?: number;
    skipSemanticCheck?: boolean;  // Skip embedding comparison (faster but less accurate)
    /** Family that produced analysisText — activates opposite-family verification rule */
    producerFamily?: LLMFamily;
    /** Hard cap on claim-citation pairs to verify (bounds critical-path time). */
    maxClaims?: number;
    /** Full-text readings from READER V3 — enables accurate verification of specific claims */
    readings?: any[];
  } = {}
): Promise<VerificationReport> {
  const { maxConcurrency = 8, producerFamily, maxClaims = 50, readings = [] } = options;
  let totalCost = 0;

  console.log(`[CitationVerifier] Starting verification for ${sources.length} sources...`);

  // Extract all citations
  const citations = extractCitations(analysisText);
  console.log(`[CitationVerifier] Found ${citations.length} citation instances`);

  if (citations.length === 0) {
    return {
      totalCitations: 0,
      uniqueSources: 0,
      supported: 0,
      partiallySup: 0,
      unsupported: 0,
      misattributed: 0,
      unverifiable: 0,
      overallIntegrity: 0,
      verifications: [],
      flaggedClaims: [],
      recommendations: ["No citations found in the analysis. All claims should be cited."],
      costUsd: 0,
    };
  }

  // Deduplicate: group citations by (srcIndex, claim) to avoid verifying the same thing twice
  const uniqueCitations = new Map<string, CitationInstance>();
  for (const c of citations) {
    const key = `${c.srcIndex}::${c.claim.slice(0, 100)}`;
    if (!uniqueCitations.has(key)) {
      uniqueCitations.set(key, c);
    }
  }

  let toVerify = Array.from(uniqueCitations.values());

  // Cap to bound critical-path time. Sample round-robin across source indices so
  // every cited source keeps representative coverage instead of truncating to the
  // first N in document order.
  if (toVerify.length > maxClaims) {
    const bySource = new Map<number, CitationInstance[]>();
    for (const c of toVerify) {
      const arr = bySource.get(c.srcIndex) ?? [];
      arr.push(c);
      bySource.set(c.srcIndex, arr);
    }
    const sampled: CitationInstance[] = [];
    const buckets = Array.from(bySource.values());
    let idx = 0;
    while (sampled.length < maxClaims && buckets.some(b => b.length > 0)) {
      const bucket = buckets[idx % buckets.length];
      if (bucket.length > 0) sampled.push(bucket.shift()!);
      idx++;
    }
    console.log(`[CitationVerifier] Capped ${toVerify.length} → ${sampled.length} pairs (round-robin across ${buckets.length} sources)`);
    toVerify = sampled;
  }

  console.log(`[CitationVerifier] ${toVerify.length} unique claim-citation pairs to verify`);

  // Verify in batches
  const verifications: CitationVerification[] = [];

  for (let i = 0; i < toVerify.length; i += maxConcurrency) {
    const batch = toVerify.slice(i, i + maxConcurrency);

    const batchResults = await Promise.allSettled(
      batch.map(citation => {
        const sourceIndex = citation.srcIndex - 1; // SRC-1 → index 0
        if (sourceIndex < 0 || sourceIndex >= sources.length) {
          return Promise.resolve<CitationVerification>({
            srcIndex: citation.srcIndex,
            claim: citation.claim,
            sourceTitle: "INVALID SOURCE INDEX",
            sourceAbstract: "",
            verdict: "misattributed",
            confidence: 100,
            semanticSimilarity: 0,
            explanation: `[SRC-${citation.srcIndex}] references a non-existent source (only ${sources.length} sources available)`,
            suggestedFix: `Remove or replace [SRC-${citation.srcIndex}] with a valid source reference`,
          });
        }
        return verifySingleCitation(citation, sources[sourceIndex], producerFamily, readings);
      })
    );

    batchResults.forEach(result => {
      if (result.status === 'fulfilled') {
        verifications.push(result.value);
      }
    });
  }

  // Estimate cost: each successful LLM verification ≈ $0.002 (800 tokens in + out at gpt-4o-mini rates)
  totalCost = verifications.filter(v => v.verdict !== "unverifiable" || v.confidence > 0).length * 0.002;

  // Compute stats
  const supported = verifications.filter(v => v.verdict === "supported").length;
  const partiallySup = verifications.filter(v => v.verdict === "partially_supported").length;
  const unsupported = verifications.filter(v => v.verdict === "unsupported").length;
  const misattributed = verifications.filter(v => v.verdict === "misattributed").length;
  const unverifiable = verifications.filter(v => v.verdict === "unverifiable").length;

  const uniqueSources = new Set(citations.map(c => c.srcIndex)).size;

  // Overall integrity score
  const totalVerified = supported + partiallySup + unsupported + misattributed;
  const overallIntegrity = totalVerified > 0
    ? Math.round(((supported * 1.0 + partiallySup * 0.6) / totalVerified) * 100)
    : 0;

  // Flag problematic citations
  const flaggedClaims = verifications.filter(v =>
    v.verdict === "unsupported" || v.verdict === "misattributed"
  );

  // Generate recommendations
  const recommendations: string[] = [];
  if (misattributed > 0) {
    recommendations.push(`CRITICAL: ${misattributed} citation(s) contradict their source. These must be corrected immediately.`);
  }
  if (unsupported > 0) {
    recommendations.push(`${unsupported} citation(s) are not supported by their referenced source. Consider removing or finding better sources.`);
  }
  if (partiallySup > verifications.length * 0.3) {
    recommendations.push(`Many citations only partially support their claims. Consider adding hedging language or additional sources.`);
  }
  if (uniqueSources < sources.length * 0.5) {
    recommendations.push(`Only ${uniqueSources} of ${sources.length} sources are cited. Consider broadening citation coverage.`);
  }
  if (overallIntegrity >= 80) {
    recommendations.push(`Citation integrity is strong (${overallIntegrity}%). Minor improvements possible.`);
  }

  console.log(`[CitationVerifier] ✅ Complete: ${supported} supported, ${partiallySup} partial, ${unsupported} unsupported, ${misattributed} misattributed | Integrity: ${overallIntegrity}%`);

  return {
    totalCitations: citations.length,
    uniqueSources,
    supported,
    partiallySup,
    unsupported,
    misattributed,
    unverifiable,
    overallIntegrity,
    verifications,
    flaggedClaims,
    recommendations,
    costUsd: totalCost,
  };
}
