/**
 * ClaimReview Integration — Google Fact Check API
 *
 * Leverages Google's ClaimReview schema to verify claims against
 * existing fact-checks from Snopes, PolitiFact, FactCheck.org, AFP Fact Check,
 * Reuters Fact Check, and 100+ other fact-checking organizations.
 *
 * API: https://content-factchecktools.googleapis.com/v1alpha1/claims:search
 * No API key required for basic usage (rate-limited).
 * With API key: higher rate limits.
 *
 * Integration in pipeline-v2.ts:
 *   const result = await checkClaimsAgainstFactCheck(claims);
 *   // If claims are contradicted by fact-checks, flag them
 */

import { httpGet } from '../http-client';

export interface FactCheckResult {
  claim: string;
  verdict: 'true' | 'false' | 'mostly-true' | 'mostly-false' | 'mixed' | 'unverified';
  factCheckUrl?: string;
  factCheckOrg?: string;
  factCheckDate?: string;
  reviewText?: string;
  similarityScore: number; // 0-1, how similar the claim is to the fact-checked claim
}

export interface ClaimCheckResult {
  checked: number;
  verified: number;
  contradicted: number;
  mixed: number;
  unverified: number;
  results: FactCheckResult[];
  costUsd: number;
}

const GOOGLE_FACT_CHECK_API = 'https://content-factchecktools.googleapis.com/v1alpha1/claims:search';

/**
 * Search Google's ClaimReview database for a given claim.
 */
async function searchClaimReview(claim: string): Promise<any | null> {
  try {
    const apiKey = process.env.GOOGLE_FACT_CHECK_API_KEY;
    const params = new URLSearchParams({
      query: claim.slice(0, 500),
      languageCode: 'en',
    });
    if (apiKey) {
      params.set('key', apiKey);
    }

    const url = `${GOOGLE_FACT_CHECK_API}?${params.toString()}`;
    const response = await httpGet<any>(url, 'google-factcheck', { timeout: 10000 });
    return response;
  } catch (err) {
    // Non-blocking — fact check API may be rate-limited or unavailable
    return null;
  }
}

/**
 * Parse the verdict from a ClaimReview rating.
 * Different fact-checkers use different rating systems.
 */
function parseVerdict(rating: string): FactCheckResult['verdict'] {
  const r = rating.toLowerCase().trim();

  // PolitiFact style
  if (r.includes('true')) return 'true';
  if (r.includes('pants on fire') || r.includes('false')) return 'false';
  if (r.includes('mostly true')) return 'mostly-true';
  if (r.includes('mostly false')) return 'mostly-false';
  if (r.includes('half true') || r.includes('half-true')) return 'mixed';

  // Snopes style
  if (r === 'true' || r.includes('correct')) return 'true';
  if (r === 'false' || r.includes('incorrect') || r.includes('fake')) return 'false';
  if (r.includes('mixture') || r.includes('mixed')) return 'mixed';
  if (r.includes('mostly true')) return 'mostly-true';
  if (r.includes('mostly false')) return 'mostly-false';

  // AFP / Reuters style
  if (r.includes('accurate')) return 'true';
  if (r.includes('inaccurate') || r.includes('wrong')) return 'false';
  if (r.includes('misleading')) return 'mostly-false';
  if (r.includes('partly') || r.includes('partially')) return 'mixed';

  // Unverifiable
  if (r.includes('unproven') || r.includes('unverified') || r.includes('no evidence')) return 'unverified';

  return 'unverified';
}

/**
 * Compute similarity between two claims (simple word overlap).
 */
function claimSimilarity(claim1: string, claim2: string): number {
  const words1 = new Set(claim1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(claim2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (words1.size === 0 || words2.size === 0) return 0;
  let intersection = 0;
  for (const w of words1) {
    if (words2.has(w)) intersection++;
  }
  const union = words1.size + words2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Check a batch of claims against Google's ClaimReview database.
 *
 * @param claims Array of claim texts to verify
 * @param minSimilarity Minimum similarity threshold (default 0.3)
 * @returns Results with verdicts for each claim
 */
export async function checkClaimsAgainstFactCheck(
  claims: string[],
  minSimilarity: number = 0.3
): Promise<ClaimCheckResult> {
  const results: FactCheckResult[] = [];
  let verified = 0;
  let contradicted = 0;
  let mixed = 0;
  let unverified = 0;

  // Process claims in parallel (batch of 5 to avoid rate limits)
  const batchSize = 5;
  for (let i = 0; i < claims.length; i += batchSize) {
    const batch = claims.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (claim) => {
        const response = await searchClaimReview(claim);
        if (!response?.claims || !Array.isArray(response.claims)) {
          return {
            claim,
            verdict: 'unverified' as const,
            similarityScore: 0,
          };
        }

        // Find the most similar fact-checked claim
        let bestMatch: any = null;
        let bestSimilarity = 0;
        for (const fc of response.claims) {
          const fcText = fc.text ?? fc.claimReview?.claimText ?? '';
          const sim = claimSimilarity(claim, fcText);
          if (sim > bestSimilarity) {
            bestSimilarity = sim;
            bestMatch = fc;
          }
        }

        if (!bestMatch || bestSimilarity < minSimilarity) {
          return {
            claim,
            verdict: 'unverified' as const,
            similarityScore: bestSimilarity,
          };
        }

        const review = bestMatch.claimReview;
        const verdict = parseVerdict(review?.textualRating ?? review?.reviewRating?.ratingValue ?? '');

        return {
          claim,
          verdict,
          factCheckUrl: review?.url,
          factCheckOrg: review?.publisher?.name,
          factCheckDate: review?.datePublished,
          reviewText: review?.textualRating,
          similarityScore: bestSimilarity,
        };
      })
    );

    for (const result of batchResults) {
      results.push(result);
      switch (result.verdict) {
        case 'true':
        case 'mostly-true':
          verified++;
          break;
        case 'false':
        case 'mostly-false':
          contradicted++;
          break;
        case 'mixed':
          mixed++;
          break;
        default:
          unverified++;
      }
    }
  }

  return {
    checked: claims.length,
    verified,
    contradicted,
    mixed,
    unverified,
    results,
    costUsd: 0, // Google Fact Check API is free
  };
}

/**
 * Get a summary of fact-check results for logging.
 */
export function formatFactCheckSummary(result: ClaimCheckResult): string {
  const lines = [
    `[ClaimReview] Checked: ${result.checked}`,
    `  ✅ Verified: ${result.verified}`,
    `  ❌ Contradicted: ${result.contradicted}`,
    `  ⚠️ Mixed: ${result.mixed}`,
    `  ❓ Unverified: ${result.unverified}`,
  ];

  const contradictedClaims = result.results.filter(r => r.verdict === 'false' || r.verdict === 'mostly-false');
  if (contradictedClaims.length > 0) {
    lines.push(`  ⚠️ Contradicted claims:`);
    for (const c of contradictedClaims.slice(0, 5)) {
      lines.push(`    • "${c.claim.slice(0, 80)}..." → ${c.verdict} by ${c.factCheckOrg ?? 'unknown'}`);
      if (c.factCheckUrl) lines.push(`      ${c.factCheckUrl}`);
    }
  }

  return lines.join('\n');
}
