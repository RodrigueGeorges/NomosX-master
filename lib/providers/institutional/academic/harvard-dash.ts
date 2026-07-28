/**
 * Harvard DASH — Harvard Institutional Repository
 * API: https://dash.harvard.edu/rest/ (DSpace 8 REST API, free, no key)
 * 58,000+ works including articles, working papers, theses, case studies
 */

import axios from 'axios';

const HARVARD_DASH_API = 'https://dash.harvard.edu/server/api/discover/search/objects';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchHarvardDASH(query: string, limit = 15): Promise<any[]> {
  console.log(`[Harvard-DASH] Searching for: "${query}"`);
  const sources: any[] = [];

  try {
    // DSpace 7+ API — use shorter query for better results
    const shortQuery = query.split(/\s+/).slice(0, 3).join(' ');
    const { data } = await axios.get(HARVARD_DASH_API, {
      params: { query: shortQuery, size: limit },
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 15000,
    }).catch(() => ({ data: null }));

    const objects = data?._embedded?.searchResult?._embedded?.objects ?? [];
    for (const obj of objects.slice(0, limit)) {
      const item = obj?._embedded?.indexableObject ?? {};
      const metadata = item?.metadata ?? {};
      const getField = (field: string) => {
        const vals = metadata[field];
        return Array.isArray(vals) ? vals[0]?.value : vals?.value ?? '';
      };
      const getAll = (field: string) => {
        const vals = metadata[field];
        return Array.isArray(vals) ? vals.map((v: any) => v.value) : [];
      };

      const title = getField('dc.title');
      const abstract = getField('dc.description.abstract');
      const authors = getAll('dc.contributor.author');
      const year = getField('dc.date.issued') ? new Date(getField('dc.date.issued')).getFullYear() : null;
      const doi = getField('dc.identifier.doi') || undefined;

      if (title) {
        sources.push({
          id: `harvard-dash:${item.id}`,
          provider: 'harvard-dash',
          type: 'institutional-repo',
          title,
          abstract: abstract?.slice(0, 2000) || '',
          authors,
          url: `https://dash.harvard.edu/handle/${item.handle}`,
          pdfUrl: item.bitstreams?.find((b: any) => b.mimeType === 'application/pdf')?.retrieveLink || null,
          doi,
          year,
          publishedDate: getField('dc.date.issued') ? new Date(getField('dc.date.issued')) : null,
          venue: getField('dc.publisher') || 'Harvard DASH',
          issuer: 'Harvard University',
          issuerType: 'academic',
          language: 'en',
          oaStatus: 'open',
          hasFullText: !!item.bitstreams?.some((b: any) => b.mimeType === 'application/pdf'),
          topics: ['harvard', 'thesis', 'research'],
          raw: { source: 'harvard-dash', itemId: item.id, handle: item.handle },
        });
      }
    }

    console.log(`[Harvard-DASH] Found ${sources.length} works`);
  } catch (error: any) {
    console.error(`[Harvard-DASH] Search failed: ${error.message}`);
  }

  return sources;
}
