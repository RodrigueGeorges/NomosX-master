/**
 * JRC — Joint Research Centre (European Commission)
 * Publications API: https://data.jrc.ec.europa.eu/api/3/action/package_search
 * Free, no API key required.
 */

import axios from 'axios';

const API_BASE = 'https://data.jrc.ec.europa.eu/api/3/action';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchJRC(query: string, limit = 15): Promise<any[]> {
  console.log(`[JRC] Searching for: "${query}"`);
  try {
    const { data } = await axios.get(`${API_BASE}/package_search`, {
      params: {
        q: query,
        rows: limit,
        sort: 'metadata_modified desc',
      },
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 15000,
    });

    const datasets: any[] = data?.result?.results || [];
    const mapped = datasets.slice(0, limit).map((ds: any) => ({
      id: `jrc:${ds.id}`,
      provider: 'jrc',
      type: 'report',
      title: ds.title || ds.title_translated?.[0]?.text || '',
      abstract: (ds.notes || ds.notes_translated?.[0]?.text || '').slice(0, 500) ||
        `JRC research publication on ${query}`,
      url: ds.url || `https://data.jrc.ec.europa.eu/dataset/${ds.id}`,
      pdfUrl: ds.resources?.find((r: any) => r.format?.toLowerCase() === 'pdf')?.url || null,
      year: ds.metadata_created ? new Date(ds.metadata_created).getFullYear() : null,
      issuer: 'Joint Research Centre (European Commission)',
      issuerType: 'government',
      language: 'en',
      oaStatus: 'open',
      hasFullText: !!ds.resources?.find((r: any) => r.format?.toLowerCase() === 'pdf'),
      topics: ds.tags?.map((t: any) => t.name) || [],
      doi: ds.extras?.find((e: any) => e.key === 'doi')?.value || null,
      raw: { source: 'jrc', searchQuery: query },
    }));

    console.log(`[JRC] Found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[JRC] Search failed: ${error.message}`);
    return [];
  }
}
