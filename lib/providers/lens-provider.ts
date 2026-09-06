/**
 * Lens.org Scholarly Provider — 200M+ scholarly records + 140M+ patents.
 * Free tier: 50 req/min. Requires API token from https://www.lens.org
 * Strong in: patents, scholarly works, multi-disciplinary coverage.
 *
 * API docs: https://docs.api.lens.org
 * Endpoint: POST https://api.lens.org/scholarly/search
 * Auth: Bearer token
 */

import { httpPost } from '../http-client';

const LENS_API_TOKEN = process.env.LENS_API_TOKEN || "";
const LENS_ENDPOINT = "https://api.lens.org/scholarly/search";

export async function searchLens(query: string, limit = 20): Promise<any[]> {
  if (!LENS_API_TOKEN) {
    console.log('[SCOUT] Lens: skipped (no LENS_API_TOKEN)');
    return [];
  }

  try {
    const body = {
      query: {
        bool: {
          must: [
            { simple_query_string: { query, fields: ["title", "abstract", "authors.name"] } }
          ]
        }
      },
      size: Math.min(limit, 100),
      sort: [{ "year": "desc" }, { "scholarly_citations_count": "desc" }],
    };

    const data: any = await httpPost(LENS_ENDPOINT, body, {
      timeout: 20000,
      retries: 2,
      rateLimiterKey: 'lens',
      headers: {
        'Authorization': `Bearer ${LENS_API_TOKEN}`,
      },
    });
    if (!data) {
      console.warn(`[SCOUT/Lens] Request failed`);
      return [];
    }
    const hits = data?.hits?.hits || [];

    if (!Array.isArray(hits)) {
      console.warn('[SCOUT/Lens] unexpected response format');
      return [];
    }

    return hits.slice(0, limit).map((hit: any, idx: number) => {
      const item = hit._source || {};
      const lensId = hit._id || item.lens_id || '';
      const doi = item.doi || '';
      const url = doi ? `https://doi.org/${doi}` : `https://www.lens.org/lens/scholar/article/${lensId}`;
      const slug = (doi || lensId).replace(/[^a-z0-9]/gi, '-').slice(0, 50).toLowerCase();

      const publishedDate = item.date_published || item.year ? `${item.year}-01-01` : null;
      let year = item.year || new Date().getFullYear();

      const authors = (Array.isArray(item.authors) ? item.authors : []).map((a: any) => ({
        name: a.name?.first || a.name?.last
          ? `${a.name.first || ''} ${a.name.last || ''}`.trim()
          : (typeof a.name === 'string' ? a.name : ''),
      })).filter((a: any) => a.name);

      const institutions: string[] = [];
      (Array.isArray(item.authors) ? item.authors : []).forEach((a: any) => {
        if (a.affiliations) {
          a.affiliations.forEach((aff: any) => {
            if (aff.name && !institutions.includes(aff.name)) institutions.push(aff.name);
          });
        }
      });

      return {
        id: `lens:${slug || idx}`,
        provider: 'lens',
        type: 'journal-article',
        title: item.title || 'Untitled',
        abstract: item.abstract || null,
        url,
        doi: doi || null,
        year,
        publishedDate,
        authors,
        institutions,
        citationCount: item.scholarly_citations_count || null,
        qualityScore: 65,
        oaStatus: item.open_access?.license ? 'open' : 'closed',
        hasFullText: !!item.open_access?.pdf_url,
        contentLength: item.abstract?.length || 0,
        raw: item,
      };
    });
  } catch (err: any) {
    console.warn(`[SCOUT/Lens] Error: ${err.message}`);
    return [];
  }
}
