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
    // Eurostat SDMX 3.0 structure API — list dataflows matching query
    const { data } = await axios.get('https://ec.europa.eu/eurostat/api/dissemination/sdmx/3.0/structure/dataflow', {
      params: { references: 'none', detail: 'allstubs' },
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/vnd.sdmx.structure+json;version=3.0.0' },
      timeout: 15000,
    });

    const dataflows: any[] = data?.data?.dataflows || data?.dataflows || [];
    // Filter by query keywords
    const qLower = query.toLowerCase();
    const matched = dataflows.filter((df: any) => {
      const name = df?.name?.en || df?.name || df?.description?.en || '';
      return name.toLowerCase().includes(qLower);
    }).slice(0, limit);

    if (matched.length > 0) {
      const mapped = matched.map((ds: any) => ({
        id: `eurostat:${ds.id}`,
        provider: 'eurostat',
        type: 'dataset',
        title: ds?.name?.en || ds?.name || ds.id || '',
        abstract: ds?.description?.en || `Eurostat statistical dataset: ${ds?.name?.en || ds.id}`,
        url: `https://ec.europa.eu/eurostat/databrowser/view/${ds.id}/`,
        pdfUrl: null,
        year: null,
        issuer: 'Eurostat',
        issuerType: 'statistics',
        language: 'multi',
        oaStatus: 'cc-by',
        hasFullText: true,
        raw: { source: 'eurostat', code: ds.id, searchQuery: query },
      }));
      console.log(`[Eurostat] SDMX API found ${mapped.length} datasets`);
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
