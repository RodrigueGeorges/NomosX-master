/**
 * data.gouv.fr - French Open Government Data Portal
 * API: https://www.data.gouv.fr/api/1/ (free, no key required)
 */

import axios from 'axios';

const API_BASE = 'https://www.data.gouv.fr/api/1';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

export async function searchDataGouv(query: string, limit = 15): Promise<any[]> {
  console.log(`[DataGouv] Searching for: "${query}"`);
  try {
    const { data } = await axios.get(`${API_BASE}/datasets`, {
      params: { q: query, page_size: limit, sort: 'reuse_count' },
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 15000,
    });

    const datasets: any[] = data?.data || [];
    const mapped = datasets.slice(0, limit).map((ds: any) => ({
      id: `data-gouv:${ds.id}`,
      provider: 'data-gouv',
      type: 'dataset',
      title: ds.title || '',
      abstract: ds.description?.slice(0, 500) || `Dataset officiel français sur ${query}`,
      url: `https://www.data.gouv.fr/datasets/${ds.id}/`,
      pdfUrl: null,
      year: ds.created_at ? new Date(ds.created_at).getFullYear() : null,
      issuer: ds.organization?.name || 'data.gouv.fr',
      issuerType: 'government',
      language: 'fr',
      oaStatus: 'open-data',
      hasFullText: true,
      topics: ds.tags || [],
      raw: { source: 'data-gouv', searchQuery: query },
    }));

    console.log(`[DataGouv] Found ${mapped.length} datasets`);
    return mapped;
  } catch (error: any) {
    console.error(`[DataGouv] Search failed: ${error.message}`);
    return [];
  }
}
