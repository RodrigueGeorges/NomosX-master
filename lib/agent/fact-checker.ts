/**
 * NomosX FACT-CHECKER — Numerical Claim Verification
 *
 * The #1 credibility problem in AI-generated think tank reports:
 * citing numbers that don't match the source data.
 *
 * This agent:
 * 1. Extracts all numerical claims from the HTML (percentages, amounts, ratios)
 * 2. For each claim, checks if the number appears in the cited source
 * 3. Flags claims where the number doesn't match the source
 * 4. Provides corrected values when possible
 *
 * Inspired by:
 * - McKinsey's fact-checking process (every number verified against source)
 * - France Stratégie's "service de la vérification"
 * - The Shift Project's data integrity standards
 */

import { callLLM } from '../llm/unified-llm';

// ============================================================================
// TYPES
// ============================================================================

export interface NumericalClaim {
  claim: string;           // Full sentence containing the number
  number: string;          // The specific number (e.g., "15%", "$2.3B", "0.34")
  context: string;         // Surrounding paragraph for context
  sourceRef: string;       // [SRC-N] reference
  sourceIndex: number;     // N from [SRC-N]
}

export interface FactCheckResult {
  claim: string;
  number: string;
  sourceRef: string;
  verified: boolean;       // Does the source support this number?
  sourceSays: string;      // What the source actually says
  discrepancy: string;     // Description of the mismatch (if any)
  severity: "none" | "minor" | "major" | "fatal";
  fix: string;             // Suggested correction
}

export interface FactCheckerOutput {
  totalClaims: number;
  verified: number;
  minorIssues: number;
  majorIssues: number;
  fatalIssues: number;
  integrityScore: number;  // 0-100
  results: FactCheckResult[];
  costUsd: number;
  durationMs: number;
}

// ============================================================================
// NUMERICAL CLAIM EXTRACTION
// ============================================================================

/**
 * Extract all numerical claims with their [SRC-N] references from HTML.
 */
function extractNumericalClaims(html: string): NumericalClaim[] {
  const claims: NumericalClaim[] = [];

  // Remove HTML tags for text extraction
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  // Find sentences containing numbers + [SRC-N] citations
  // Pattern: sentence with number + nearby [SRC-N]
  const numberPatterns = [
    /(\d+\.?\d*)\s*%/g,                          // percentages: 15%, 23.5%
    /\$\s?(\d+\.?\d*)\s*[BbMmKk]/g,              // dollar amounts: $2.3B, $15M
    /(\d+\.?\d*)\s*(?:billion|million|thousand)/gi, // word amounts: 2.3 billion
    /(?:effect size|cohen|d\s*=\s*)(\d+\.?\d*)/gi, // effect sizes: d = 0.45
    /(?:p\s*[<>=]\s*)(\d+\.?\d*)/gi,              // p-values: p < 0.05
    /(?:n\s*=\s*)(\d[\d,]*)/gi,                    // sample sizes: n = 1,500
    /(?:increase|decrease|rise|drop|fall|growth|decline)\s+(?:of\s+)?(\d+\.?\d*)/gi, // changes: increase of 12%
  ];

  // Split into sentences
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.length > 20);

  for (const sentence of sentences) {
    // Check if sentence has a [SRC-N] reference
    const srcMatches = [...sentence.matchAll(/\[SRC-(\d+)\]/g)];
    if (srcMatches.length === 0) continue;

    // Check if sentence has a number
    for (const pattern of numberPatterns) {
      const numMatches = [...sentence.matchAll(pattern)];
      if (numMatches.length > 0) {
        for (const numMatch of numMatches) {
          const number = numMatch[0];
          // Avoid duplicates
          if (claims.some(c => c.claim === sentence && c.number === number)) continue;

          claims.push({
            claim: sentence.slice(0, 300),
            number,
            context: sentence.slice(0, 300),
            sourceRef: srcMatches[0][0],
            sourceIndex: parseInt(srcMatches[0][1], 10),
          });
        }
        break; // One pattern match per sentence is enough
      }
    }
  }

  return claims;
}

// ============================================================================
// FACT-CHECKING (LLM-powered)
// ============================================================================

async function factCheckBatch(
  claims: NumericalClaim[],
  sources: any[]
): Promise<FactCheckResult[]> {
  if (claims.length === 0) return [];

  // Build source context for referenced sources
  const referencedSourceIndices = [...new Set(claims.map(c => c.sourceIndex))];
  const sourceContext = referencedSourceIndices
    .filter(i => i >= 1 && i <= sources.length)
    .map(i => {
      const s = sources[i - 1];
      return `[SRC-${i}] ${s.title}
Year: ${s.year || "N/A"} | Provider: ${s.provider}
Abstract: ${(s.abstract || "").slice(0, 800)}`;
    }).join("\n\n");

  const claimsList = claims.map((c, i) =>
    `${i + 1}. CLAIM: "${c.claim.slice(0, 200)}" — Number: ${c.number} — Source: ${c.sourceRef}`
  ).join("\n");

  const prompt = `You are a FACT-CHECKER at a top-tier think tank. Your job is to verify that every numerical claim in the analysis is supported by its cited source.

SOURCES:
${sourceContext}

CLAIMS TO VERIFY:
${claimsList}

For EACH claim, check:
1. Does the cited source actually contain this number or a compatible number?
2. Is the number accurately represented (not rounded misleadingly, not taken out of context)?
3. Is the context correct (e.g., is a 15% increase being described as a 15% share)?

SEVERITY LEVELS:
- "none": Number is verified or reasonably inferred from source data
- "minor": Small discrepancy (e.g., source says 14.7%, report says 15%) — acceptable rounding
- "major": Significant discrepancy (e.g., source says 7%, report says 15%) — needs correction
- "fatal": Number appears fabricated or contradicts source directly — must be removed or corrected

Return JSON:
{
  "results": [
    {
      "claim": "the claim text",
      "number": "the number",
      "sourceRef": "[SRC-N]",
      "verified": true/false,
      "sourceSays": "what the source actually says about this number",
      "discrepancy": "description of mismatch or 'none'",
      "severity": "none|minor|major|fatal",
      "fix": "suggested correction or 'none needed'"
    }
  ]
}

Be STRICT. Think tanks are destroyed by a single fabricated number.`;

  try {
    const response = await callLLM({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 4000,
      model: 'deepseek-v4-flash', // Fact-checking is matching — fast model sufficient & cost-efficient
      provider: 'deepseek',
    });

    const parsed = JSON.parse(response.content);
    return parsed.results || [];
  } catch (error: any) {
    console.warn(`[FACT-CHECKER] LLM fact-check failed: ${error.message}`);
    // Return unverified results
    return claims.map(c => ({
      claim: c.claim,
      number: c.number,
      sourceRef: c.sourceRef,
      verified: false,
      sourceSays: "Verification failed",
      discrepancy: "Could not verify — LLM error",
      severity: "minor" as const,
      fix: "Manual verification required",
    }));
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function factChecker(
  html: string,
  sources: any[]
): Promise<FactCheckerOutput> {
  const start = Date.now();
  console.log(`[FACT-CHECKER] Verifying numerical claims in HTML (${(html.length / 1024).toFixed(0)}KB, ${sources.length} sources)`);

  // Step 1: Extract numerical claims
  const claims = extractNumericalClaims(html);
  console.log(`[FACT-CHECKER] Found ${claims.length} numerical claims to verify`);

  if (claims.length === 0) {
    return {
      totalClaims: 0,
      verified: 0,
      minorIssues: 0,
      majorIssues: 0,
      fatalIssues: 0,
      integrityScore: 100,
      results: [],
      costUsd: 0,
      durationMs: Date.now() - start,
    };
  }

  // Step 2: Fact-check in batches of 20
  const allResults: FactCheckResult[] = [];
  let totalCost = 0;

  for (let i = 0; i < claims.length; i += 20) {
    const batch = claims.slice(i, i + 20);
    const batchResults = await factCheckBatch(batch, sources);
    allResults.push(...batchResults);
  }

  // Step 3: Compute integrity score
  const verified = allResults.filter(r => r.verified || r.severity === "none").length;
  const minorIssues = allResults.filter(r => r.severity === "minor").length;
  const majorIssues = allResults.filter(r => r.severity === "major").length;
  const fatalIssues = allResults.filter(r => r.severity === "fatal").length;

  // Integrity = 100 - (fatal*20 + major*10 + minor*2), clamped to 0-100
  const integrityScore = Math.max(0, Math.min(100,
    100 - (fatalIssues * 20) - (majorIssues * 10) - (minorIssues * 2)
  ));

  const durationMs = Date.now() - start;
  console.log(`[FACT-CHECKER] Complete: ${claims.length} claims, ${verified} verified, ${majorIssues} major, ${fatalIssues} fatal → integrity ${integrityScore}%`);

  return {
    totalClaims: claims.length,
    verified,
    minorIssues,
    majorIssues,
    fatalIssues,
    integrityScore,
    results: allResults,
    costUsd: totalCost,
    durationMs,
  };
}
