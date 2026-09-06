/**
 * Prediction Market Integration — External forecast validation
 *
 * Integrates real-time prediction market data to ground Delphi forecasts
 * in market expectations. Prediction markets are often more accurate than
 * individual experts (Wisdom of Crowds, Hayek's information aggregation).
 *
 * Sources:
 * - Polymarket (public API, no key needed)
 * - Metaculus (public API, no key needed)
 *
 * Usage in foresight-delphi.ts:
 *   const marketData = await fetchPredictionMarketData(question, scenarioNames);
 *   // Blend market probabilities with Delphi estimates
 */

import { httpGet } from '../http-client';

export interface MarketPrediction {
  source: 'polymarket' | 'metaculus';
  question: string;
  marketQuestion: string;
  probability: number; // 0-1
  volume: number; // Trading volume or number of predictions
  endDate?: string;
  url?: string;
  relevanceScore: number; // 0-1, how relevant to our question
}

export interface MarketDataResult {
  predictions: MarketPrediction[];
  avgProbability: number | null; // Average across all matching markets
  costUsd: number;
}

/**
 * Fetch from Polymarket public API.
 * No API key required — uses public CLOB API.
 */
async function fetchPolymarket(query: string): Promise<MarketPrediction[]> {
  try {
    // Polymarket Gamma API — search for relevant markets
    const url = `https://gamma-api.polymarket.com/markets?closed=false&limit=20&order=volume&ascending=false&tag=${encodeURIComponent(query.slice(0, 50))}`;
    const response = await httpGet<any>(url, { timeout: 10000, rateLimiterKey: 'polymarket' });

    if (!response || !Array.isArray(response)) return [];

    const predictions: MarketPrediction[] = [];
    for (const market of response.slice(0, 10)) {
      const question = market.question ?? '';
      const outcomePrices = market.outcomePrices ?? market.clob?.outcomePrices;
      let probability = 0.5;

      // Parse outcome prices — Polymarket stores as JSON string array
      if (typeof outcomePrices === 'string') {
        try {
          const prices = JSON.parse(outcomePrices);
          if (Array.isArray(prices) && prices.length > 0) {
            probability = parseFloat(prices[0]);
          }
        } catch {}
      } else if (Array.isArray(outcomePrices) && outcomePrices.length > 0) {
        probability = parseFloat(outcomePrices[0]);
      }

      if (isNaN(probability) || probability < 0 || probability > 1) continue;

      predictions.push({
        source: 'polymarket',
        question: query,
        marketQuestion: question,
        probability,
        volume: parseFloat(market.volume ?? '0') || 0,
        endDate: market.endDate,
        url: market.slug ? `https://polymarket.com/event/${market.slug}` : undefined,
        relevanceScore: 0.5, // Will be computed by caller
      });
    }

    return predictions;
  } catch (err) {
    console.warn('[PredictionMarkets] Polymarket fetch failed:', err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * Fetch from Metaculus public API.
 * No API key required — uses public API v2.
 */
async function fetchMetaculus(query: string): Promise<MarketPrediction[]> {
  try {
    // Metaculus API v2 — search for relevant questions
    const url = `https://www.metaculus.com/api2/questions/?search=${encodeURIComponent(query.slice(0, 80))}&status=open&limit=10&order_by=-activity`;
    const response = await httpGet<any>(url, { timeout: 10000, rateLimiterKey: 'metaculus' });

    if (!response || !Array.isArray(response.results ?? response)) return [];

    const results = response.results ?? response;
    const predictions: MarketPrediction[] = [];

    for (const q of results.slice(0, 10)) {
      const question = q.title ?? '';
      // Metaculus community prediction
      const communityPrediction = q.community_prediction?.full ?? q.prediction?.full;
      let probability = 0.5;

      if (typeof communityPrediction === 'number') {
        probability = communityPrediction;
      } else if (communityPrediction && typeof communityPrediction === 'object') {
        // Binary questions have {x: probability}
        probability = communityPrediction.x ?? 0.5;
      }

      if (isNaN(probability) || probability < 0 || probability > 1) continue;

      predictions.push({
        source: 'metaculus',
        question: query,
        marketQuestion: question,
        probability,
        volume: q.number_of_predictions ?? 0,
        endDate: q.resolve_time ?? q.close_time,
        url: q.id ? `https://www.metaculus.com/questions/${q.id}` : undefined,
        relevanceScore: 0.5,
      });
    }

    return predictions;
  } catch (err) {
    console.warn('[PredictionMarkets] Metaculus fetch failed:', err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * Compute relevance score between our question and a market question.
 * Uses simple word overlap (Jaccard similarity).
 */
function computeRelevance(ourQuestion: string, marketQuestion: string): number {
  const ourWords = new Set(ourQuestion.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const marketWords = new Set(marketQuestion.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (ourWords.size === 0 || marketWords.size === 0) return 0;
  let intersection = 0;
  for (const w of ourWords) {
    if (marketWords.has(w)) intersection++;
  }
  const union = ourWords.size + marketWords.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Main entry: fetch prediction market data for a question.
 * Returns relevant market predictions with relevance scores.
 */
export async function fetchPredictionMarketData(
  question: string,
  scenarioNames?: string[]
): Promise<MarketDataResult> {
  // Fetch from both sources in parallel
  const [polymarket, metaculus] = await Promise.all([
    fetchPolymarket(question),
    fetchMetaculus(question),
  ]);

  let allPredictions = [...polymarket, ...metaculus];

  // If we have scenario names, also search for each scenario
  if (scenarioNames && scenarioNames.length > 0) {
    const scenarioResults = await Promise.all(
      scenarioNames.slice(0, 5).map(name =>
        Promise.all([fetchPolymarket(name), fetchMetaculus(name)])
      )
    );
    for (const [poly, meta] of scenarioResults) {
      allPredictions.push(...poly, ...meta);
    }
  }

  // Compute relevance scores
  allPredictions = allPredictions.map(p => ({
    ...p,
    relevanceScore: computeRelevance(question, p.marketQuestion),
  }));

  // Filter by relevance (> 10% overlap) and sort by relevance × volume
  const relevant = allPredictions
    .filter(p => p.relevanceScore > 0.1)
    .sort((a, b) => (b.relevanceScore * Math.log(b.volume + 2)) - (a.relevanceScore * Math.log(a.volume + 2)))
    .slice(0, 10);

  // Compute average probability weighted by relevance × volume
  let avgProbability: number | null = null;
  if (relevant.length > 0) {
    const totalWeight = relevant.reduce((sum, p) => sum + p.relevanceScore * Math.log(p.volume + 2), 0);
    if (totalWeight > 0) {
      avgProbability = relevant.reduce((sum, p) => sum + p.probability * p.relevanceScore * Math.log(p.volume + 2), 0) / totalWeight;
    }
  }

  return {
    predictions: relevant,
    avgProbability,
    costUsd: 0, // Both APIs are free
  };
}

/**
 * Blend Delphi estimate with prediction market data.
 * Uses inverse-variance weighting: markets with high volume get more weight.
 *
 * @param delphiProb - Probability from Delphi process (0-1)
 * @param marketProb - Average probability from prediction markets (0-1)
 * @param marketVolume - Total volume across all matching markets
 * @returns Blended probability (0-1)
 */
export function blendWithMarket(
  delphiProb: number,
  marketProb: number | null,
  marketVolume: number
): number {
  if (marketProb == null || isNaN(marketProb)) return delphiProb;

  // Weight: markets with high volume are more trustworthy
  // Log scale: 1000 volume → weight 0.3, 10000 → 0.4, 100000 → 0.5
  const marketWeight = Math.min(0.5, 0.2 + Math.log10(Math.max(1, marketVolume)) * 0.05);
  const delphiWeight = 1 - marketWeight;

  return delphiWeight * delphiProb + marketWeight * marketProb;
}
