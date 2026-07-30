/**
 * Springer Nature Provider — 10M+ articles from Springer + Nature journals.
 * Free API key from https://dev.springernature.com
 * Strong in: physics, engineering, medicine, life sciences, computer science.
 *
 * API docs: https://dev.springernature.com
 * Endpoint: https://api.springernature.com/metadata/json
 */

const SPRINGER_API_KEY = process.env.SPRINGER_API_KEY || "";
const SPRINGER_ENDPOINT = "https://api.springernature.com/metadata/json";

export async function searchSpringer(query: string, limit = 20): Promise<any[]> {
  if (!SPRINGER_API_KEY) {
    console.log('[SCOUT] Springer: skipped (no SPRINGER_API_KEY)');
    return [];
  }

  try {
    const params = new URLSearchParams({
      q: query,
      api_key: SPRINGER_API_KEY,
      p: String(Math.min(limit, 100)),
      s: '1',
    });

    const response = await fetch(`${SPRINGER_ENDPOINT}?${params}`, {
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      console.warn(`[SCOUT/Springer] HTTP ${response.status}`);
      return [];
    }

    const data = await response.json() as any;
    const records = data?.records || [];

    if (!Array.isArray(records)) {
      console.warn('[SCOUT/Springer] unexpected response format');
      return [];
    }

    return records.slice(0, limit).map((item: any, idx: number) => {
      const doi = item.doi || '';
      const url = item.url?.[0]?.value || item.url || `https://doi.org/${doi}`;
      const slug = (doi || url).replace(/[^a-z0-9]/gi, '-').slice(0, 50).toLowerCase();

      const publishedDate = item.publicationDate || item.onlineDate || null;
      let year = new Date().getFullYear();
      if (publishedDate) {
        const parsed = new Date(publishedDate);
        if (!isNaN(parsed.getTime())) year = parsed.getFullYear();
      }

      const authors = (item.creators || []).map((c: any) => ({
        name: c.creator || c.name || '',
      })).filter((a: any) => a.name);

      const institutions: string[] = [];
      if (item.publisher) institutions.push(item.publisher);

      return {
        id: `springer:${slug || idx}`,
        provider: 'springer',
        type: 'journal-article',
        title: item.title || 'Untitled',
        abstract: item.abstract || null,
        url,
        doi: doi || null,
        year,
        publishedDate,
        authors,
        institutions,
        citationCount: null,
        qualityScore: 65,
        oaStatus: item.openaccess ? 'open' : 'closed',
        hasFullText: !!item.openaccess,
        contentLength: item.abstract?.length || 0,
        raw: item,
      };
    });
  } catch (err: any) {
    console.warn(`[SCOUT/Springer] Error: ${err.message}`);
    return [];
  }
}
