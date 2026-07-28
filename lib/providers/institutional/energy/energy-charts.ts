/**
 * energy-charts.info — European electricity prices, generation, flows
 * API: https://api.energy-charts.info/ (free, no key required)
 * Covers all European bidding zones with real-time and historical data
 */

import axios from 'axios';

const ENERGY_CHARTS_API = 'https://api.energy-charts.info';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchEnergyCharts(query: string, limit = 15): Promise<any[]> {
  console.log(`[EnergyCharts] Searching for: "${query}"`);
  const sources: any[] = [];

  try {
    // Get day-ahead prices for major European countries
    const countries = ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'PL', 'DK'];
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    for (const country of countries) {
      if (sources.length >= limit) break;
      try {
        const { data } = await axios.get(`${ENERGY_CHARTS_API}/price`, {
          params: { country, start: weekAgo.toISOString().split('T')[0], end: today.toISOString().split('T')[0] },
          headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
          timeout: 10000,
        }).catch(() => ({ data: null }));

        // Response format: { price: [number, ...], timestamp: [...], unit: "EUR/MWh" }
        const prices = data?.price ?? data?.values ?? data?.data ?? [];
        if (Array.isArray(prices) && prices.length > 0) {
            const avg = prices.reduce((s: number, p: any) => s + (typeof p === 'number' ? p : p?.price ?? 0), 0) / prices.length;
            sources.push({
              id: `energy-charts:prices:${country}`,
              provider: 'energy-charts',
              type: 'dataset',
              title: `Energy Charts — Day-Ahead Electricity Prices: ${country} (last 7 days)`,
              abstract: `Average day-ahead electricity price for ${country}: €${avg.toFixed(2)}/MWh over the last 7 days. Relevant to: ${query}`,
              url: `https://energy-charts.info/charts/price_day_ahead/chart.htm?l=${country}&c=${country}`,
              pdfUrl: null,
              year: today.getFullYear(),
              issuer: 'energy-charts.info',
              issuerType: 'energy',
              language: 'en',
              oaStatus: 'open',
              hasFullText: false,
              topics: ['electricity', 'prices', 'europe', country.toLowerCase()],
              raw: { source: 'energy-charts', country, avgPrice: avg, dataPoints: prices.length },
            });
          }
      } catch { /* per-country failure */ }
    }

    // Get generation mix for Germany (most detailed)
    if (sources.length < limit) {
      try {
        const { data } = await axios.get(`${ENERGY_CHARTS_API}/generation`, {
          params: { country: 'DE', start: weekAgo.toISOString().split('T')[0], end: today.toISOString().split('T')[0] },
          headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
          timeout: 10000,
        }).catch(() => ({ data: null }));

        if (data) {
          sources.push({
            id: `energy-charts:generation:DE`,
            provider: 'energy-charts',
            type: 'dataset',
            title: `Energy Charts — German Electricity Generation Mix (last 7 days)`,
            abstract: `Real-time German generation mix by fuel type (nuclear, coal, gas, wind, solar, biomass). Relevant to: ${query}`,
            url: `https://energy-charts.info/charts/power/chart.htm?l=DE&c=DE`,
            pdfUrl: null,
            year: today.getFullYear(),
            issuer: 'energy-charts.info',
            issuerType: 'energy',
            language: 'en',
            oaStatus: 'open',
            hasFullText: false,
            topics: ['electricity', 'generation', 'germany', 'renewables'],
            raw: { source: 'energy-charts', country: 'DE', type: 'generation' },
          });
        }
      } catch { /* generation failure */ }
    }

    console.log(`[EnergyCharts] Found ${sources.length} datasets`);
  } catch (error: any) {
    console.error(`[EnergyCharts] Search failed: ${error.message}`);
  }

  return sources;
}
