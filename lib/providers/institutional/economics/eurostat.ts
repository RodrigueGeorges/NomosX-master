/**
 * Eurostat - EU Statistical Office
 * Primary: Eurostat JSON API (free, no key required)
 * API: https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/
 * Fallback: OpenAlex with European Commission ROR
 */

import axios from 'axios';
import { searchOpenAlex } from '../../openalex';

const API_BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com | contact@nomosx.com)';

export async function searchEurostat(query: string, limit = 15): Promise<any[]> {
  console.log(`[Eurostat] Searching for: "${query}"`);

  try {
    // Eurostat dataset search via their search API
    const { data } = await axios.get('https://ec.europa.eu/eurostat/api/dissemination/catalogue/datasets', {
      params: { lang: 'en', query, limit },
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 15000,
    });

    const datasets: any[] = data?.datasets || data?.results || [];
    if (datasets.length > 0) {
      const mapped = datasets.slice(0, limit).map((ds: any) => ({
        id: `eurostat:${ds.code || ds.id}`,
        provider: 'eurostat',
        type: 'dataset',
        title: ds.title?.en || ds.title || ds.label || '',
        abstract: ds.shortDescription?.en || `Eurostat statistical dataset on ${query}`,
        url: `https://ec.europa.eu/eurostat/databrowser/view/${ds.code || ds.id}/`,
        pdfUrl: null,
        year: ds.lastUpdate ? new Date(ds.lastUpdate).getFullYear() : null,
        issuer: 'Eurostat',
        issuerType: 'statistics',
        language: 'multi',
        oaStatus: 'cc-by',
        hasFullText: true,
        raw: { source: 'eurostat', code: ds.code, searchQuery: query },
      }));
      console.log(`[Eurostat] API found ${mapped.length} datasets`);
      return mapped;
    }
  } catch {
    // fall through to OpenAlex
  }

  // Fallback: OpenAlex with European Commission affiliation
  try {
    const results = await searchOpenAlex(`${query} European statistics EU Eurostat`, limit, {
      filter: 'authorships.institutions.ror:https://ror.org/02az9a613',
    });
    const mapped = results.map(r => ({
      ...r,
      id: `eurostat:${r.id?.replace('https://openalex.org/', '') || ''}`,
      provider: 'eurostat',
      issuer: 'Eurostat',
      issuerType: 'statistics',
    }));
    console.log(`[Eurostat] OpenAlex fallback found ${mapped.length} publications`);
    return mapped;
  } catch (error: any) {
    console.error(`[Eurostat] Search failed: ${error.message}`);
    return [];
  }
}
