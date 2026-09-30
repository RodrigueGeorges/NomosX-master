/**
 * APITube Provider — Real-time news API with entity extraction & sentiment.
 * Free tier: full enriched schema, no credit card required.
 * 500K+ sources, 59 languages, 177+ countries.
 * Each article enriched with entities, sentiment, categories, source authority.
 */

import { fetchFromProvider } from '../http-client';
import { isFreeRun } from '../free-run';

const APITUBE_API_KEY = process.env.APITUBE_API_KEY || "";
const APITUBE_ENDPOINT = "https://api.apitube.io/v1/news/articles";

export async function searchAPITube(query: string, limit = 20): Promise<any[]> {
  if (isFreeRun() || !APITUBE_API_KEY) {
    console.log(`[SCOUT] APITube: skipped (${isFreeRun() ? 'FREE RUN' : 'no APITUBE_API_KEY'})`);
    return [];
  }

  try {
    const params = new URLSearchParams({
      q: query,
      limit: String(Math.min(limit, 50)),
      sort: 'date_desc',
    });

    const data: any = await fetchFromProvider('apitube', `${APITUBE_ENDPOINT}?${params}`, { timeout: 15000, retries: 2, headers: { 'X-API-Key': APITUBE_API_KEY, 'Accept': 'application/json' } });
    if (!data) {
      console.warn(`[SCOUT/APITube] Request failed`);
      return [];
    }
    const articles = data?.articles || data?.data || data?.results || [];

    if (!Array.isArray(articles)) {
      console.warn('[SCOUT/APITube] unexpected response format');
      return [];
    }

    return articles.slice(0, limit).map((item: any, idx: number) => {
      const url = item.url || item.link || '';
      const slug = url.replace(/[^a-z0-9]/gi, '-').slice(0, 50).toLowerCase();

      const publishedDate = item.published_at || item.publishedAt || item.date || null;
      let year = new Date().getFullYear();
      if (publishedDate) {
        const parsed = new Date(publishedDate);
        if (!isNaN(parsed.getTime())) year = parsed.getFullYear();
      }

      // Extract entities for richer metadata
      const entities = item.entities || [];
      const entityNames = Array.isArray(entities)
        ? entities.map((e: any) => e.name || e.text || '').filter(Boolean)
        : [];

      // Extract authors
      const authors: Array<{ name: string }> = [];
      if (item.author) {
        if (typeof item.author === 'string') {
          authors.push({ name: item.author });
        } else if (item.author.name) {
          authors.push({ name: item.author.name });
        }
      }

      const institutions: string[] = [];
      if (item.source || item.publisher) {
        institutions.push(item.source || item.publisher);
      }

      // Build abstract from summary or content
      const abstract = item.summary || item.description || item.content?.slice(0, 500) || null;

      return {
        id: `apitube:${slug || idx}`,
        provider: 'apitube',
        type: 'news-article',
        title: item.title || item.headline || 'Untitled',
        abstract,
        url,
        year,
        publishedDate,
        authors,
        institutions,
        citationCount: null,
        qualityScore: 40,
        oaStatus: 'open',
        hasFullText: !!(item.content && item.content.length > 500),
        contentLength: item.content?.length || item.summary?.length || 0,
        doi: null,
        topics: item.categories || [],
        entities: entityNames,
        sentiment: item.sentiment || null,
        raw: item,
      };
    });
  } catch (err: any) {
    console.warn(`[SCOUT/APITube] Error: ${err.message}`);
    return [];
  }
}
