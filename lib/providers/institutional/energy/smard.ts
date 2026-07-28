/**
 * SMARD.de — German Federal Network Agency (Bundesnetzagentur) market data
 * Original SMARD API deprecated. Now uses energy-charts.info API which
 * serves the same Bundesnetzagentur data under CC BY 4.0.
 */

import axios from 'axios';

const EC_API = 'https://api.energy-charts.info';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchSMARD(query: string, limit = 10): Promise<any[]> {
  console.log(`[SMARD] Searching for: "${query}"`);
  const sources: any[] = [];

  try {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const start = weekAgo.toISOString().split('T')[0];
    const end = today.toISOString().split('T')[0];

    // Data types mapped to energy-charts endpoints
    const dataTypes = [
      { path: '/price', params: { country: 'DE' }, label: 'Day-ahead prices (Germany)' },
      { path: '/generation', params: { country: 'DE' }, label: 'Generation by fuel type (Germany)' },
      { path: '/consumption', params: { country: 'DE' }, label: 'Electricity consumption (Germany)' },
    ];

    for (const dt of dataTypes) {
      if (sources.length >= limit) break;
      try {
        const { data } = await axios.get(`${EC_API}${dt.path}`, {
          params: { ...dt.params, start, end },
          headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
          timeout: 10000,
        }).catch(() => ({ data: null }));

        // Check if we got valid data (any array or object with values)
        const hasData = data && (
          Array.isArray(data) ||
          (data.price && Array.isArray(data.price)) ||
          (data.values && Array.isArray(data.values)) ||
          (data.unix_seconds && Array.isArray(data.unix_seconds))
        );

        if (hasData) {
          sources.push({
            id: `smard:${dt.path.slice(1)}`,
            provider: 'smard',
            type: 'dataset',
            title: `SMARD — ${dt.label} (${start} to ${end})`,
            abstract: `German electricity market data from Bundesnetzagentur via energy-charts: ${dt.label}. Time series data for the last 7 days. Relevant to: ${query}`,
            url: `https://www.smard.de/en`,
            pdfUrl: null,
            year: today.getFullYear(),
            issuer: 'Bundesnetzagentur (SMARD via energy-charts)',
            issuerType: 'energy',
            language: 'en',
            oaStatus: 'open',
            hasFullText: false,
            topics: ['electricity', 'germany', 'market', 'energy'],
            raw: { source: 'smard-energy-charts', path: dt.path, country: 'DE' },
          });
        }
      } catch { /* per-type failure */ }
    }

    console.log(`[SMARD] Found ${sources.length} datasets`);
  } catch (error: any) {
    console.error(`[SMARD] Search failed: ${error.message}`);
  }

  return sources;
}
