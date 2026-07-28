/**
 * MIT DSpace — MIT Institutional Repository
 * API: https://dspace.mit.edu/rest/ (DSpace REST API, free, no key)
 * 60,000+ works including theses, technical reports, white papers
 */

import axios from 'axios';

const MIT_DSPACE_API = 'https://dspace.mit.edu/server/api/discover/search/objects';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchMITDSpace(query: string, limit = 15): Promise<any[]> {
  console.log(`[MIT-DSpace] Searching for: "${query}"`);
  const sources: any[] = [];

  try {
    // DSpace 7+ API — use shorter query for better results
    const shortQuery = query.split(/\s+/).slice(0, 3).join(' ');
    const { data } = await axios.get(MIT_DSPACE_API, {
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
          id: `mit-dspace:${item.id}`,
          provider: 'mit-dspace',
          type: 'institutional-repo',
          title,
          abstract: abstract?.slice(0, 2000) || '',
          authors,
          url: `https://dspace.mit.edu/handle/${item.handle}`,
          pdfUrl: item.bitstreams?.find((b: any) => b.mimeType === 'application/pdf')?.retrieveLink || null,
          doi,
          year,
          publishedDate: getField('dc.date.issued') ? new Date(getField('dc.date.issued')) : null,
          venue: getField('dc.publisher') || 'MIT DSpace',
          issuer: 'MIT',
          issuerType: 'academic',
          language: 'en',
          oaStatus: 'open',
          hasFullText: !!item.bitstreams?.some((b: any) => b.mimeType === 'application/pdf'),
          topics: ['mit', 'thesis', 'research'],
          raw: { source: 'mit-dspace', itemId: item.id, handle: item.handle },
        });
      }
    }

    console.log(`[MIT-DSpace] Found ${sources.length} works`);
  } catch (error: any) {
    console.error(`[MIT-DSpace] Search failed: ${error.message}`);
  }

  return sources;
}
