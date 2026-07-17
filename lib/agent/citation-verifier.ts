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
  const normalized = text
    .replace(/<sup class="cite"><a href="#ref-(\d+)"[^>]*>\s*(\d+)\s*<\/a><\/sup>/gi, "[SRC-$1]")
    .replace(/<sup class="cite"><a href="#ref-(\d+)"[^>]*>([\s\S]*?)<\/a><\/sup>/gi, "[SRC-$1]")
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
// SEMANTIC VERIFICATION
// ============================================================================

/**
 * Verify a single citation using both semantic similarity and LLM judgment.
 */
async function verifySingleCitation(
  citation: CitationInstance,
  source: any,
  producerFamily?: LLMFamily,
): Promise<CitationVerification> {
  const sourceContent = `${source.title}\n${source.abstract || ""}`.trim();

  // Step 1: Semantic similarity (fast, cheap)
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

  // Step 2: LLM verification (deep, accurate)
  try {
    const response = await callLLM({
      messages: [{
        role: "user",
        content: `You are a citation verification expert. Determine if the cited source actually supports the claim made.

CLAIM IN THE ANALYSIS:
"${citation.claim}"

BROADER CONTEXT:
"${citation.context.slice(0, 500)}"

CITED SOURCE:
Title: ${source.title}
Abstract: ${(source.abstract || "No abstract available").slice(0, 1500)}
Year: ${source.year || "N/A"}

VERDICT OPTIONS:
- "supported": The source clearly supports this claim
- "partially_supported": The source is related but the claim overstates or simplifies
- "unsupported": The source does not support this specific claim
- "misattributed": The claim contradicts what the source actually says
- "unverifiable": Cannot determine (e.g., no abstract available)

Return JSON:
{
  "verdict": "supported|partially_supported|unsupported|misattributed|unverifiable",
  "confidence": 0-100,
  "explanation": "Why this verdict — be specific about what matches or doesn't",
  "suggestedFix": "How to fix if problematic (null if supported)"
}`
      }],
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 800,
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
      sourceAbstract: (source.abstract || "").slice(0, 200),
      verdict: result.verdict || "unverifiable",
      confidence: result.confidence || 50,
      semanticSimilarity: semanticSim,
      explanation: result.explanation || "",
      suggestedFix: result.suggestedFix || undefined,
    };
  } catch (error: any) {
    console.warn(`[CitationVerifier] LLM verification failed for SRC-${citation.srcIndex}: ${error.message}`);
    return {
      srcIndex: citation.srcIndex,
      claim: citation.claim,
      sourceTitle: source.title,
      sourceAbstract: (source.abstract || "").slice(0, 200),
      verdict: "unverifiable",
      confidence: 0,
      semanticSimilarity: semanticSim,
      explanation: `Verification failed: ${error.message}`,
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
  } = {}
): Promise<VerificationReport> {
  const { maxConcurrency = 5, producerFamily } = options;
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

  const toVerify = Array.from(uniqueCitations.values());
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
        return verifySingleCitation(citation, sources[sourceIndex], producerFamily);
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
