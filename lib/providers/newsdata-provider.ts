/**
 * NewsData.io Provider — Free news API (200 credits/day, 10 articles/credit)
 *
 * Free tier: 200 API credits/day, 10 articles per request, 48h lookback.
 * No credit card required. Key required (free registration).
 *
 * KEY VALUE: Complements GDELT with structured news metadata:
 * - Category filtering (politics, business, technology, environment, etc.)
 * - Country and language filtering
 * - Multiple languages supported
 *
 * API: https://newsdata.io/api/1/news
 * Docs: https://newsdata.io/documentation
 */

import { fetchFromProvider } from '../http-client';
import { isFreeRun } from '../free-run';

const NEWSDATA_ENDPOINT = 'https://newsdata.io/api/1/news';

export async function searchNewsData(query: string, limit = 10): Promise<any[]> {
  if (isFreeRun()) return [];
  const apiKey = process.env.NEWSDATA_API_KEY;
  if (!apiKey) {
    return [];
  }

  try {
    const params = new URLSearchParams({
      apikey: apiKey,
      q: query.slice(0, 512),
      language: 'en',
      size: String(Math.min(limit, 10)),
    });

    const data: any = await fetchFromProvider('newsdata', `${NEWSDATA_ENDPOINT}?${params}`, {
      timeout: 15000,
      retries: 1,
      headers: { 'Accept': 'application/json' },
    });

    const results = data?.results || [];
    console.log(`[NewsData] Found ${results.length} articles`);

    return results.map((article: any) => ({
      id: `newsdata:${article.article_id || Math.random()}`,
      provider: 'newsdata',
      type: 'news',
      title: article.title || 'Untitled',
      abstract: article.description || article.content || null,
      url: article.link || article.url || null,
      doi: null,
      year: article.pubDate ? new Date(article.pubDate).getFullYear() : new Date().getFullYear(),
      publishedDate: article.pubDate || null,
      authors: article.creator ? [{ name: article.creator }] : [],
      institutions: article.source_id ? [article.source_id] : [],
      citationCount: 0,
      qualityScore: 45,
      oaStatus: 'open',
      hasFullText: !!article.content,
      documentType: 'news-article',
      issuer: article.source_id || 'NewsData',
      issuerType: 'news',
      classification: 'news',
      language: article.language || 'en',
      contentFormat: 'text',
      contentLength: article.description?.length || 0,
      raw: article,
    }));
  } catch (err: any) {
    console.warn(`[NewsData] Error: ${err.message}`);
    return [];
  }
}
