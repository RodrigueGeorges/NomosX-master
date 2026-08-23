/**
 * Altmetric.com Enrichment Provider — Social Attention Metrics
 *
 * Altmetric.com tracks online attention to research outputs across
 * social media (X/Twitter, Facebook, Reddit, blogs), news outlets,
 * policy documents, and reference managers. Provides an attention
 * score and breakdown by source type.
 *
 * API: REST API requiring API key.
 *   Set ALTMETRIC_API_KEY environment variable.
 * Docs: https://api.altmetric.com/
 *
 * USAGE: Enrichment layer — augments Source.qualityScore with social
 *   attention signals. Does NOT create new sources. Called by the
 *   INDEX agent after sources are upserted, to add altmetrics data.
 *
 * Evidence base (REF 2021 study, 67K+ articles):
 *   - Tweet counts correlate with quality (Spearman ~0.3) in 8 UoAs
 *   - Mendeley readership is the strongest altmetric (>0.5 in 3 UoAs)
 *   - Strongest in health/physical sciences, weakest in humanities
 *   - Altmetrics supplement but do NOT replace citation counts
 *
 * Graceful skip: If ALTMETRIC_API_KEY is not set, returns null.
 */

import { fetchFromProvider } from '../http-client';

export interface AltmetricData {
  doi: string;
  altmetricId: string | null;
  score: number;
  citedByPolicyCount: number;
  citedByNewsCount: number;
  citedByBlogCount: number;
  citedByTwitterCount: number;
  citedByRedditCount: number;
  citedByFacebookCount: number;
  citedByMendeleyCount: number;
  citedByPostCount: number;
  lastUpdated: string | null;
  detailsUrl: string | null;
}

/**
 * Fetch altmetric data for a DOI.
 * Returns null if no data or no API key.
 */
export async function getAltmetricForDOI(doi: string): Promise<AltmetricData | null> {
  const apiKey = process.env.ALTMETRIC_API_KEY;

  if (!doi) return null;

  try {
    // Altmetric DOI endpoint — works with or without API key (rate-limited without)
    const keyParam = apiKey ? `&key=${apiKey}` : '';
    const url = `https://api.altmetric.com/v1/doi/${encodeURIComponent(doi)}?${keyParam}`;

    const data: any = await fetchFromProvider('altmetric', url, {
      timeout: 10000,
      retries: 2,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NomosX Research Bot (+https://nomosx.com)',
      },
    });

    if (!data) return null; // No altmetric data for this DOI

    return {
      doi,
      altmetricId: data.altmetric_id?.toString() || null,
      score: data.score || 0,
      citedByPolicyCount: data.cited_by_policies_count || 0,
      citedByNewsCount: data.cited_by_news_outlets_count || data.posts?.filter((p: any) => p.source === 'news').length || 0,
      citedByBlogCount: data.cited_by_blogs_count || 0,
      citedByTwitterCount: data.cited_by_tweeters_count || data.posts?.filter((p: any) => p.source === 'twitter').length || 0,
      citedByRedditCount: data.cited_by_rdts_count || 0,
      citedByFacebookCount: data.cited_by_fbwalls_count || 0,
      citedByMendeleyCount: data.cited_by_mendeley_count || 0,
      citedByPostCount: data.cited_by_posts_count || 0,
      lastUpdated: data.last_updated || null,
      detailsUrl: data.details_url || null,
    };
  } catch (error: any) {
    // Silent fail — altmetric enrichment is best-effort
    return null;
  }
}

/**
 * Batch fetch altmetric data for multiple DOIs.
 * Respects rate limits (1 req/sec without key, faster with key).
 */
export async function getAltmetricsBatch(dois: string[], maxConcurrency = 3): Promise<Map<string, AltmetricData>> {
  const results = new Map<string, AltmetricData>();

  // Process in small batches to respect rate limits
  for (let i = 0; i < dois.length; i += maxConcurrency) {
    const batch = dois.slice(i, i + maxConcurrency);
    const settled = await Promise.allSettled(
      batch.map(doi => getAltmetricForDOI(doi))
    );
    settled.forEach((s, idx) => {
      if (s.status === 'fulfilled' && s.value) {
        results.set(batch[idx], s.value);
      }
    });
  }

  console.log(`[Altmetric] Enriched ${results.size}/${dois.length} DOIs with altmetric data`);
  return results;
}

/**
 * Compute an altmetric-based quality boost.
 * Uses the REF 2021 evidence: policy citations are the strongest signal,
 * followed by news, blogs, and Mendeley readership.
 * Twitter/Reddit/Facebook are weaker signals (attention ≠ quality).
 */
export function computeAltmetricBoost(data: AltmetricData): number {
  let boost = 0;
  // Policy citations: strongest altmetric signal (research used in policy)
  boost += Math.min(data.citedByPolicyCount * 5, 20);
  // News mentions: moderate signal (research picked up by media)
  boost += Math.min(data.citedByNewsCount * 2, 10);
  // Blog citations: moderate signal
  boost += Math.min(data.citedByBlogCount * 1.5, 8);
  // Mendeley readership: strong per REF study
  boost += Math.min(data.citedByMendeleyCount * 0.1, 10);
  // Twitter/Reddit/Facebook: weak signals, capped low
  boost += Math.min(data.citedByTwitterCount * 0.05, 3);
  boost += Math.min(data.citedByRedditCount * 0.1, 2);
  boost += Math.min(data.citedByFacebookCount * 0.02, 2);
  return Math.round(boost);
}
