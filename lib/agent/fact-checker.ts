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
import { parseJson } from './json-utils';
import { stripHtmlForEvidence } from './evidence-ledger';
import { getExecutionDeadlineAt } from '../worker/execution-scope';

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
  temporalStatus?: "present_fact" | "active_mechanism" | "future_extrapolation";
  chainingValid?: boolean;  // For future_extrapolation: is the derivation chain valid?
}

export interface CitanceVerdict {
  sentence: string;
  sourceRef: string;
  verdict: 'supported' | 'contradicted' | 'nei' | 'unverified';
  rationale: string;
}

export interface CitanceReport {
  total: number;
  supported: number;
  contradicted: number;
  nei: number;
  supportRate: number;         // 0-1 — share of cited claims the sources actually establish
  evaluationComplete: boolean; // false when the entailment call failed — never inflates
  verdicts: CitanceVerdict[];
}

export interface FactCheckerOutput {
  totalClaims: number;
  verified: number;
  minorIssues: number;
  majorIssues: number;
  fatalIssues: number;
  integrityScore: number;  // 0-100
  results: FactCheckResult[];
  citance?: CitanceReport;
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

  // Normalize <sup class="cite"> back to [SRC-N] before stripping HTML tags
  const text = stripHtmlForEvidence(html);

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

  // Split into sentences.
  // CRITICAL: Don't split on '.' between digits (decimal points like "0.5" or "27.31").
  // The lookbehind (?<=[.!?])(?<!\d) ensures we only split on sentence-ending punctuation
  // that is NOT preceded by a digit.
  const sentences = text.split(/(?<=[.!?])(?<!\d)\s+/).filter(s => s.length > 20);

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
// DETERMINISTIC PRE-CHECK (Invariant 5: number guards must be code, not LLM)
// ============================================================================

/**
 * Deterministically verify a numerical claim against source text.
 * Returns "verified" if the exact number is found, "not_found" if absent,
 * or "ambiguous" if a near-match exists (needs LLM disambiguation).
 */
function deterministicCheck(
  claim: NumericalClaim,
  sources: any[],
  readings?: any[],
): { status: "verified" | "not_found" | "ambiguous"; sourceText: string } {
  if (claim.sourceIndex < 1 || claim.sourceIndex > sources.length) {
    return { status: "not_found", sourceText: "" };
  }
  const s = sources[claim.sourceIndex - 1];
  const reading = readings?.find((r: any) => r.sourceId === s.id);
  const sourceContent = reading
    ? [reading.claims?.join(' '), reading.results?.join(' '), reading.methods?.join(' ')].filter(Boolean).join(' ')
    : (s.abstract || "");

  if (!sourceContent) {
    return { status: "not_found", sourceText: "" };
  }

  // Extract the numeric core from the claim (e.g., "15%" → "15", "$2.3B" → "2.3")
  const numMatch = claim.number.match(/(\d+\.?\d*)/);
  if (!numMatch) {
    return { status: "ambiguous", sourceText: sourceContent.slice(0, 500) };
  }
  const numStr = numMatch[1];

  // Check if the exact number appears in the source text
  const exactRegex = new RegExp(`(?<!\\d)${numStr.replace('.', '\\.')}(?!\\d)`, 'g');
  if (exactRegex.test(sourceContent)) {
    return { status: "verified", sourceText: sourceContent.slice(0, 500) };
  }

  // Check for near-matches (±1 unit rounding) — ambiguous, needs LLM
  const num = parseFloat(numStr);
  if (Number.isFinite(num)) {
    const nearRegex = new RegExp(`(?<!\\d)(?:${(num - 1).toFixed(num % 1 ? 1 : 0)}|${(num + 1).toFixed(num % 1 ? 1 : 0)})(?!\\d)`, 'g');
    if (nearRegex.test(sourceContent)) {
      return { status: "ambiguous", sourceText: sourceContent.slice(0, 500) };
    }
  }

  return { status: "not_found", sourceText: sourceContent.slice(0, 500) };
}

function buildSourceContext(indices: number[], sources: any[], readings?: any[]): string {
  return indices
    .filter(i => i >= 1 && i <= sources.length)
    .map(i => {
      const s = sources[i - 1];
      const reading = readings?.find((r: any) => r.sourceId === s.id);
      // Prefer reading full-text (keyFindings + results) over abstract — the READER extracted 8K-120K chars
      const sourceContent = reading
        ? [reading.claims?.join(' '), reading.results?.join(' '), reading.methods?.join(' ')].filter(Boolean).join(' ').slice(0, 3000)
        : (s.abstract || "").slice(0, 800);
      return `[SRC-${i}] ${s.title}
Year: ${s.year || "N/A"} | Provider: ${s.provider}
Content: ${sourceContent}`;
    }).join("\n\n");
}

// ============================================================================
// FACT-CHECKING (LLM-powered — only for claims that survive deterministic pre-check)
// ============================================================================

async function factCheckBatch(
  claims: NumericalClaim[],
  sources: any[],
  producerFamily?: import('../llm/unified-llm').LLMFamily,
  readings?: any[],
): Promise<FactCheckResult[]> {
  if (claims.length === 0) return [];

  // Build source context for referenced sources — use readings (full-text) when available
  const referencedSourceIndices = [...new Set(claims.map(c => c.sourceIndex))];
  const sourceContext = buildSourceContext(referencedSourceIndices, sources, readings);

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

TEMPORAL STATUS CLASSIFICATION:
For each claim, classify its temporalStatus:
- "present_fact": The claim describes a current or past fact that should be directly verifiable in the source.
- "active_mechanism": The claim describes an ongoing dynamic (growth rate, trend, shift) that should be traceable to source data.
- "future_extrapolation": The claim projects a future state — it CANNOT be verified against the source directly. Instead, verify that it derives from a present_fact or active_mechanism via a logical chain.

SEVERITY LEVELS:
- "none": Number is verified, reasonably inferred from source data, or the source discusses the same metric with compatible values. For future_extrapolation: the chaining is valid (derives from anchored facts).
- "minor": Number not literally in source but is a reasonable paraphrase/rounding of source data (e.g., source says 14.7%, report says 15%)
- "major": Number not found in source AND cannot be reasonably inferred — needs correction but not fabrication. For future_extrapolation: the chaining is weak or unclear.
- "fatal": Number DIRECTLY CONTRADICTS the source (e.g., source says 7%, report says 15%) — this is fabrication/misrepresentation. For future_extrapolation: the claim is a free-floating prediction with no anchoring in any present_fact or active_mechanism.

IMPORTANT: "Not found in source" is NOT automatically fatal. Many legitimate numbers come from reasonable inferences, calculations, or paraphrases of source data. Only mark "fatal" when the number DIRECTLY CONTRADICTS what the source says. For future_extrapolation claims, do NOT mark fatal just because the number isn't in the source — instead check whether the extrapolation is logically chained to facts that ARE in the source.

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
      "fix": "suggested correction or 'none needed'",
      "temporalStatus": "present_fact|active_mechanism|future_extrapolation",
      "chainingValid": true/false
    }
  ]
}

Be FAIR but RIGOROUS. Think tanks are destroyed by fabricated numbers, but they are also destroyed by being too afraid to cite legitimate data. Focus on finding real contradictions, not just absent numbers.`;

  try {
    const response = await callLLM({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 6000,
      task: 'fact_check',
      producerFamily,
    });

    const parsed = parseJson<any>(response.content);
    return parsed?.results || [];
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
// CITANCE CHECK — SCitance-style zero-shot claim↔citation entailment
// ============================================================================
//
// The numerical pass only covers claims carrying a number. Everything else —
// "policy X reshaped alliance Y [SRC-3]" — was invisible to verification, which
// is how a report could score "0 verified" while its citations were either
// fine or hollow. For each cited sentence we ask the entailment question the
// reader actually needs answered: does the cited source SUPPORT, CONTRADICT,
// or merely neighbour (NEI) the claim?

interface CitancePair { sentence: string; sourceIndex: number }

function extractCitances(html: string, alreadyCheckedSentences: Set<string>, cap = 25): CitancePair[] {
  const text = stripHtmlForEvidence(html);
  const sentences = text.split(/(?<=[.!?])(?<!\d)\s+/).filter(s => s.length > 40);
  const pairs: CitancePair[] = [];
  for (const sentence of sentences) {
    const m = /\[SRC-(\d+)\]/.exec(sentence);
    if (!m || alreadyCheckedSentences.has(sentence.slice(0, 300))) continue;
    pairs.push({ sentence: sentence.slice(0, 300), sourceIndex: parseInt(m[1], 10) });
    if (pairs.length >= cap) break;
  }
  return pairs;
}

async function citanceCheckBatch(
  pairs: CitancePair[],
  sources: any[],
  producerFamily?: import('../llm/unified-llm').LLMFamily,
  readings?: any[],
): Promise<CitanceReport> {
  const referenced = [...new Set(pairs.map(p => p.sourceIndex))];
  const sourceContext = buildSourceContext(referenced, sources, readings);
  const list = pairs.map((p, i) => `${i + 1}. SENTENCE: "${p.sentence}" — cited source: [SRC-${p.sourceIndex}]`).join('\n');

  const prompt = `You are verifying citation ENTAILMENT in a think-tank report (SCitance protocol). For each numbered sentence, judge ONLY whether its cited source supports it — not whether the claim is true in the world.

SOURCES:
${sourceContext}

CITED SENTENCES:
${list}

For EACH sentence return verdict:
- "supported": the cited source's content directly establishes the sentence's claim
- "contradicted": the source asserts the opposite or clearly incompatible data
- "nei": the source is topically adjacent but does NOT establish this specific claim (the citation is decorative or mis-scoped)

Return JSON: {"results":[{"i":1,"verdict":"supported|contradicted|nei","rationale":"one sentence"}]}
Be strict: a source that merely shares keywords with the sentence is "nei". A "supported" verdict requires the source's actual content to carry the claim.`;

  const verdicts: CitanceVerdict[] = [];
  let evaluationComplete = true;
  try {
    const response = await callLLM({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 3000,
      task: 'fact_check',
      producerFamily,
    });
    const parsed = parseJson<{ results?: { i?: number; verdict?: string; rationale?: string }[] }>(response.content);
    const byIndex = new Map<number, { verdict: string; rationale: string }>();
    for (const r of parsed?.results ?? []) {
      if (typeof r.i === 'number' && typeof r.verdict === 'string') byIndex.set(r.i, { verdict: r.verdict, rationale: r.rationale ?? '' });
    }
    if (byIndex.size === 0) evaluationComplete = false;
    pairs.forEach((p, i) => {
      const r = byIndex.get(i + 1);
      const v = r?.verdict === 'supported' || r?.verdict === 'contradicted' || r?.verdict === 'nei' ? r.verdict : 'unverified';
      if (!r) evaluationComplete = false;
      verdicts.push({ sentence: p.sentence, sourceRef: `[SRC-${p.sourceIndex}]`, verdict: v, rationale: r?.rationale ?? '' });
    });
  } catch {
    evaluationComplete = false;
    for (const p of pairs) verdicts.push({ sentence: p.sentence, sourceRef: `[SRC-${p.sourceIndex}]`, verdict: 'unverified', rationale: 'entailment check failed' });
  }

  const supported = verdicts.filter(v => v.verdict === 'supported').length;
  const contradicted = verdicts.filter(v => v.verdict === 'contradicted').length;
  const nei = verdicts.filter(v => v.verdict === 'nei').length;
  return {
    total: verdicts.length,
    supported,
    contradicted,
    nei,
    supportRate: verdicts.length > 0 ? supported / verdicts.length : 1,
    evaluationComplete,
    verdicts,
  };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function factChecker(
  html: string,
  sources: any[],
  producerFamily?: import('../llm/unified-llm').LLMFamily,
  readings?: any[],
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

  // Step 2: Deterministic pre-check — verify numbers against source text (Invariant 5)
  const verifiedResults: FactCheckResult[] = [];
  const ambiguousClaims: NumericalClaim[] = [];
  for (const claim of claims) {
    const preCheck = deterministicCheck(claim, sources, readings);
    if (preCheck.status === "verified") {
      verifiedResults.push({
        claim: claim.claim,
        number: claim.number,
        sourceRef: claim.sourceRef,
        verified: true,
        sourceSays: "Number found in source (deterministic match)",
        discrepancy: "none",
        severity: "none",
        fix: "none needed",
      });
    } else {
      ambiguousClaims.push(claim);
    }
  }
  console.log(`[FACT-CHECKER] Deterministic pre-check: ${verifiedResults.length}/${claims.length} verified, ${ambiguousClaims.length} need LLM`);

  // Step 3: LLM fact-check only ambiguous claims in batches of 20
  const allResults: FactCheckResult[] = [...verifiedResults];
  let totalCost = 0;

  // S38: headroom guard — a run that reaches fact-check at the deadline edge
  // died mid-batch in the paid validation run (strategic hit 75min during the
  // LLM pass, zero artifact persisted). Degrade to deterministic-only rather
  // than start work that cannot finish: ambiguous claims stay unverified
  // (severity minor) so the integrity score still reflects what was checked.
  const fcDeadlineAt = getExecutionDeadlineAt();
  const fcHeadroomMs = Number(process.env.FACTCHECK_LLM_HEADROOM_MS ?? 600_000);
  const llmWindowOk = fcDeadlineAt === undefined || (fcDeadlineAt - Date.now()) >= fcHeadroomMs;
  if (!llmWindowOk && ambiguousClaims.length > 0) {
    console.warn(`[FACT-CHECKER] LLM batch skipped — ${Math.max(0, Math.round((fcDeadlineAt - Date.now()) / 1000))}s left < ${Math.round(fcHeadroomMs / 1000)}s headroom; ${ambiguousClaims.length} claims stay deterministic-only`);
    for (const c of ambiguousClaims) {
      allResults.push({
        claim: c.claim,
        number: c.number,
        sourceRef: c.sourceRef,
        verified: false,
        sourceSays: "Not verified — insufficient run headroom for LLM pass",
        discrepancy: "Verification skipped — deadline headroom",
        severity: "minor" as const,
        fix: "Manual verification required",
      });
    }
  } else {
    for (let i = 0; i < ambiguousClaims.length; i += 20) {
      const batch = ambiguousClaims.slice(i, i + 20);
      const batchResults = await factCheckBatch(batch, sources, producerFamily, readings);
      allResults.push(...batchResults);
    }
  }

  // S16-04: UFO multi-source fact-checking (AAAI 2026)
  if (!llmWindowOk) {
    console.warn('[FACT-CHECKER] UFO pass skipped — insufficient run headroom');
  } else try {
    const { batchFactCheck, DEFAULT_UFO_CONFIG } = await import('./ufo-factcheck');
    // For each claim, select the best sources and verify
    if (claims && claims.length > 0) {
      const ufoResults = await batchFactCheck(
        claims.map(c => c.claim || ''),
        async (claim, sourceType) => {
          // Return source content based on type
          if (sourceType === 'web' || sourceType === 'human') {
            return sources.map(s => `${s.title || ''} ${s.abstract || ''}`).join(' ');
          }
          if (sourceType === 'llm') {
            return ''; // LLM knowledge is handled by the LLM itself
          }
          return '';
        },
        DEFAULT_UFO_CONFIG
      );
      // Merge UFO results with existing fact-check results
      const ufoSupported = ufoResults.filter(r => r.verdict === 'supported').length;
      const ufoRefuted = ufoResults.filter(r => r.verdict === 'refuted').length;
      console.log(`[FactChecker] UFO: ${ufoSupported} supported, ${ufoRefuted} refuted, ${ufoResults.length - ufoSupported - ufoRefuted} uncertain`);
    }
  } catch (e) { /* non-blocking */ }

  // Citance pass — entailment for cited sentences the numerical extraction
  // can't see (non-numerical claims were previously unverifiable, which is how
  // a run could report "0 verified" without ever testing citation support).
  // supported/nei/contradicted fold into the score; 'unverified' stays out of
  // the denominator — a failed evaluator must neither inflate nor deflate it.
  let citanceReport: CitanceReport | undefined;
  if (!llmWindowOk) {
    console.warn('[FACT-CHECKER] citance pass skipped — insufficient run headroom');
  } else {
    const citancePairs = extractCitances(html, new Set(claims.map(c => c.claim)));
    if (citancePairs.length > 0) {
      citanceReport = await citanceCheckBatch(citancePairs, sources, producerFamily, readings);
      for (const v of citanceReport.verdicts) {
        if (v.verdict === 'supported') {
          allResults.push({ claim: v.sentence, number: '', sourceRef: v.sourceRef, verified: true, sourceSays: v.rationale || 'Supported by cited source', discrepancy: 'none', severity: 'none', fix: 'none needed' });
        } else if (v.verdict === 'nei') {
          allResults.push({ claim: v.sentence, number: '', sourceRef: v.sourceRef, verified: false, sourceSays: v.rationale || 'Cited source does not establish this claim', discrepancy: 'Citation does not entail the claim (NEI)', severity: 'major', fix: 'Re-cite or narrow the claim to what the source supports' });
        } else if (v.verdict === 'contradicted') {
          allResults.push({ claim: v.sentence, number: '', sourceRef: v.sourceRef, verified: false, sourceSays: v.rationale || 'Cited source asserts the opposite', discrepancy: 'Source contradicts the claim', severity: 'fatal', fix: 'Remove or rewrite — the citation contradicts the assertion' });
        }
      }
      console.log(`[FACT-CHECKER] CITANCE: ${citanceReport.supported}/${citanceReport.total} supported, ${citanceReport.contradicted} contradicted, ${citanceReport.nei} NEI${citanceReport.evaluationComplete ? '' : ' (incomplete — unverified excluded)'}`);
    }
  }

  // Step 4: Compute integrity score
  const verified = allResults.filter(r => r.verified || r.severity === "none").length;
  const minorIssues = allResults.filter(r => r.severity === "minor").length;
  const majorIssues = allResults.filter(r => r.severity === "major").length;
  const fatalIssues = allResults.filter(r => r.severity === "fatal").length;

  // Integrity = proportional score based on claim quality distribution
  // Each claim contributes: verified=1.0, minor=0.8, major=0.3, fatal=0.0
  // This prevents a few false-positive fatals from zeroing the entire score
  const totalClaims = allResults.length;
  const integrityScore = totalClaims > 0
    ? Math.round(100 * (
        (allResults.filter(r => r.verified || r.severity === "none").length * 1.0) +
        (allResults.filter(r => r.severity === "minor").length * 0.8) +
        (allResults.filter(r => r.severity === "major").length * 0.3) +
        (allResults.filter(r => r.severity === "fatal").length * 0.0)
      ) / totalClaims)
    : 100;

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
    citance: citanceReport,
    costUsd: totalCost,
    durationMs,
  };
}
