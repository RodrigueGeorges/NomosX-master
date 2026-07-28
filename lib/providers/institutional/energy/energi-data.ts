/**
 * Energi Data Service — Danish real-time energy data
 * API: https://api.energidataservice.dk/dataset (free, no key)
 * CO2 emissions, production, prices, electricity balance
 */

import axios from 'axios';

const EDS_API = 'https://api.energidataservice.dk/dataset';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchEnergiDataService(query: string, limit = 10): Promise<any[]> {
  console.log(`[EnergiData] Searching for: "${query}"`);
  const sources: any[] = [];

  try {
    const datasets = [
      { id: 'CO2EmisProg', label: 'CO2 emissions prognosis' },
      { id: 'ElectricityProdex5MinRealtime', label: 'Real-time electricity production (5min)' },
      { id: 'Elspotprices', label: 'Day-ahead electricity prices' },
      { id: 'ElectricityBalance', label: 'Electricity balance' },
    ];

    for (const ds of datasets) {
      if (sources.length >= limit) break;
      try {
        const { data } = await axios.get(`${EDS_API}/${ds.id}`, {
          params: { limit: 1, sort: 'Minutes5UTC DESC' },
          headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
          timeout: 10000,
        }).catch(() => ({ data: null }));

        const records = data?.records ?? [];
        if (records.length > 0) {
          sources.push({
            id: `energi-data:${ds.id}`,
            provider: 'energi-data',
            type: 'dataset',
            title: `Energi Data Service — ${ds.label} (Denmark)`,
            abstract: `Danish energy data from Energi Data Service: ${ds.label}. Real-time dataset. Relevant to: ${query}`,
            url: `https://energidataservice.dk/tso-electricity/${ds.id}`,
            pdfUrl: null,
            year: new Date().getFullYear(),
            issuer: 'Energi Data Service (Energinet)',
            issuerType: 'energy',
            language: 'en',
            oaStatus: 'open',
            hasFullText: false,
            topics: ['electricity', 'denmark', 'energy', 'co2', 'grid'],
            raw: { source: 'energi-data', dataset: ds.id, totalRecords: data?.total ?? 0 },
          });
        }
      } catch { /* per-dataset failure */ }
    }

    console.log(`[EnergiData] Found ${sources.length} datasets`);
  } catch (error: any) {
    console.error(`[EnergiData] Search failed: ${error.message}`);
  }

  return sources;
}
