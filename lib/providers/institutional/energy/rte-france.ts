/**
 * RTE France — French electricity transmission system operator
 * API: RTE ODRE (Open Data Réseaux Énergies) — https://data.rte-france.com
 * French generation (nuclear, wind, solar), consumption, exchanges
 * Some endpoints are free without authentication
 */

import axios from 'axios';

const RTE_ODRE_API = 'https://odre.opendatasoft.com/api/records/1.0/search';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchRTEFrance(query: string, limit = 10): Promise<any[]> {
  console.log(`[RTE-France] Searching for: "${query}"`);
  const sources: any[] = [];

  try {
    const datasets = [
      'eco2mix-national-tr',
      'eco2mix-regional-tr',
      'courbe-de-charge-consommation-locale',
      'production-eolienne-et-solaire-regionale',
    ];

    for (const dataset of datasets) {
      if (sources.length >= limit) break;
      try {
        const { data } = await axios.get(RTE_ODRE_API, {
          params: {
            dataset,
            rows: 1,
          },
          headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
          timeout: 10000,
        }).catch(() => ({ data: null }));

        const records = data?.records ?? [];
        if (records.length > 0 || (data?.nhits ?? 0) > 0) {
          const fields = records[0]?.fields ?? {};
          sources.push({
            id: `rte-france:${dataset}`,
            provider: 'rte-france',
            type: 'dataset',
            title: `RTE France — ${dataset.replace(/-/g, ' ')} (real-time)`,
            abstract: `French electricity data from RTE ODRE: ${dataset}. Latest data: ${JSON.stringify(fields).slice(0, 300)}. Relevant to: ${query}`,
            url: `https://odre.opendatasoft.com/explore/dataset/${dataset}/`,
            pdfUrl: null,
            year: new Date().getFullYear(),
            issuer: 'RTE France (ODRE)',
            issuerType: 'energy',
            language: 'fr',
            oaStatus: 'open',
            hasFullText: false,
            topics: ['electricity', 'france', 'energy', 'grid'],
            raw: { source: 'rte-france', dataset, recordCount: data?.nhits ?? 0 },
          });
        }
      } catch { /* per-dataset failure */ }
    }

    console.log(`[RTE-France] Found ${sources.length} datasets`);
  } catch (error: any) {
    console.error(`[RTE-France] Search failed: ${error.message}`);
  }

  return sources;
}
