/**
 * LinkUp Provider — Scout-compatible search via the official LinkUp SDK.
 * Only `searchLinkUp` is used by the active pipeline.
 */

import { LinkupClient } from 'linkup-sdk';

const LINKUP_API_KEY = process.env.LINKUP_API_KEY || "";

// ===== SCOUT-COMPATIBLE SEARCH FUNCTION =====
export async function searchLinkUp(query: string, limit = 15): Promise<any[]> {
  if (!LINKUP_API_KEY) {
    console.log('[SCOUT] LinkUp: skipped (no LINKUP_API_KEY)');
    return [];
  }

  try {
    const client = new LinkupClient({ apiKey: LINKUP_API_KEY });
    const response = await client.search({
      query,
      depth: 'standard',
      outputType: 'searchResults',
      includeImages: false,
    } as any);
    const raw = response as any;

    const rawResults = raw?.results || raw?.data?.results || raw?.data || [];
    if (!Array.isArray(rawResults)) {
      console.warn('[SCOUT] LinkUp: unexpected response format');
      return [];
    }

    return rawResults.slice(0, limit).map((item: any, idx: number) => {
      const url = item.url || item.link || '';
      const slug = url.replace(/[^a-z0-9]/gi, '-').slice(0, 50).toLowerCase();

      // Extract authors from various possible fields in Linkup response
      const rawAuthors = item.authors || item.author || item.byline || item.creator || null;
      let authors: Array<{ name: string; orcid?: string | null }> = [];
      if (Array.isArray(rawAuthors)) {
        authors = rawAuthors.map((a: any) => ({
          name: typeof a === 'string' ? a : (a.name || a.displayName || a.givenName + ' ' + a.familyName || '').trim(),
          orcid: a.orcid || a.orcidId || null,
        })).filter((a: any) => a.name);
      } else if (typeof rawAuthors === 'string' && rawAuthors.trim()) {
        // Byline format: "By John Doe" or "John Doe, Jane Smith"
        const cleaned = rawAuthors.replace(/^by\s+/i, '').trim();
        if (cleaned) {
          authors = cleaned.split(/[,;]| and /i).map((name: string) => ({
            name: name.trim(),
          })).filter((n: any) => n.name && n.name.length > 2);
        }
      }

      // Extract year from publishedDate if available
      const publishedDate = item.publishedDate || item.date || item.published_at || null;
      let year = new Date().getFullYear();
      if (publishedDate) {
        const parsed = new Date(publishedDate);
        if (!isNaN(parsed.getTime())) year = parsed.getFullYear();
      }

      // Extract institution/source name from item
      const institutions: string[] = [];
      if (item.source || item.publisher || item.siteName) {
        institutions.push(item.source || item.publisher || item.siteName);
      }

      return {
        id: `linkup:${slug || idx}`,
        provider: 'linkup',
        type: 'report',
        title: item.title || item.name || 'Untitled',
        abstract: item.content || item.snippet || item.description || null,
        url,
        year,
        publishedDate,
        authors,
        institutions,
        citationCount: null,
        qualityScore: 40,
        oaStatus: 'open',
        hasFullText: !!(item.content && item.content.length > 500),
        contentLength: item.content?.length || item.snippet?.length || 0,
        raw: item,
      };
    });
  } catch (err: any) {
    console.warn(`[SCOUT] LinkUp search failed: ${err.message}`);
    return [];
  }
}

