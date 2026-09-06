/**
 * Dimensions (Digital Science) Provider — 140M+ publications, grants, patents, clinical trials.
 * Free API tier: 1 req/s. Requires API key from https://app.dimensions.ai
 * Multi-disciplinary: covers all research domains.
 *
 * API docs: https://docs.dimensions.ai/dsl
 * Endpoint: POST https://app.dimensions.ai/api/dsl
 * Auth: JWT key
 */

import { httpPost } from '../http-client';

const DIMENSIONS_API_KEY = process.env.DIMENSIONS_API_KEY || "";
const DIMENSIONS_ENDPOINT = "https://app.dimensions.ai/api/dsl";

export async function searchDimensions(query: string, limit = 20): Promise<any[]> {
  if (!DIMENSIONS_API_KEY) {
    console.log('[SCOUT] Dimensions: skipped (no DIMENSIONS_API_KEY)');
    return [];
  }

  try {
    // Dimensions DSL query — search publications
    const dslQuery = `search publications in full_data for "${query.replace(/"/g, '\\"')}" return publications[basics+abstract+authors+open_access] limit ${Math.min(limit, 100)}`;

    const data: any = await httpPost(DIMENSIONS_ENDPOINT, { query: dslQuery }, {
      timeout: 25000,
      retries: 2,
      rateLimiterKey: 'dimensions',
      headers: {
        'Authorization': `JWT ${DIMENSIONS_API_KEY}`,
      },
    });
    if (!data) {
      console.warn(`[SCOUT/Dimensions] Request failed`);
      return [];
    }
    const publications = data?._stats?._total > 0 ? (data?.publications || []) : [];

    if (!Array.isArray(publications)) {
      console.warn('[SCOUT/Dimensions] unexpected response format');
      return [];
    }

    return publications.slice(0, limit).map((item: any, idx: number) => {
      const doi = item.doi || '';
      const id = item.id || '';
      const url = doi ? `https://doi.org/${doi}` : `https://app.dimensions.ai/details/publication/${id}`;
      const slug = (doi || id).replace(/[^a-z0-9]/gi, '-').slice(0, 50).toLowerCase();

      const publishedDate = item.publication_date || null;
      let year = item.year || new Date().getFullYear();
      if (publishedDate) {
        const parsed = new Date(publishedDate);
        if (!isNaN(parsed.getTime())) year = parsed.getFullYear();
      }

      const authors = (Array.isArray(item.authors) ? item.authors : []).map((a: any) => ({
        name: a.full_name || a.last_name
          ? `${a.first_name || ''} ${a.last_name || ''}`.trim()
          : (typeof a === 'string' ? a : ''),
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
        id: `dimensions:${slug || idx}`,
        provider: 'dimensions',
        type: 'journal-article',
        title: item.title || 'Untitled',
        abstract: item.abstract || null,
        url,
        doi: doi || null,
        year,
        publishedDate,
        authors,
        institutions,
        citationCount: item.times_cited || null,
        qualityScore: 70,
        oaStatus: item.open_access?.is_oa ? 'open' : 'closed',
        hasFullText: !!item.open_access?.pdf_url,
        contentLength: item.abstract?.length || 0,
        raw: item,
      };
    });
  } catch (err: any) {
    console.warn(`[SCOUT/Dimensions] Error: ${err.message}`);
    return [];
  }
}
