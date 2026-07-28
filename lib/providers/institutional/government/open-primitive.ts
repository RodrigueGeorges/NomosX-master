/**
 * Open Primitive — US Federal Data API (30 domains, no key)
 * API: https://api.openprimitive.com/v1/ (free, no key, no limits)
 * Covers: electricity (EIA), SEC, health (PubMed), clinical trials,
 * demographics (Census), weather (NWS), air quality (EPA), etc.
 */

import axios from 'axios';

const OPEN_PRIMITIVE_API = 'https://api.openprimitive.com/v1';
const USER_AGENT = 'NomosX Research Bot (+https://nomosx.com)';

export async function searchOpenPrimitive(query: string, limit = 15): Promise<any[]> {
  console.log(`[OpenPrimitive] Searching for: "${query}"`);
  const sources: any[] = [];

  try {
    // Use the /ask endpoint for cross-domain search
    const { data } = await axios.get(`${OPEN_PRIMITIVE_API}/ask`, {
      params: { q: query },
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 15000,
    }).catch(() => ({ data: null }));

    if (data?.results) {
      for (const result of data.results.slice(0, limit)) {
        sources.push({
          id: `open-primitive:${result.domain ?? 'unknown'}:${Buffer.from(result.title || '').toString('base64').slice(0, 16)}`,
          provider: 'open-primitive',
          type: 'dataset',
          title: result.title || `US Federal Data — ${result.domain}`,
          abstract: result.summary?.slice(0, 500) || result.description?.slice(0, 500) || `US federal data relevant to: ${query}`,
          url: result.url || result.link || `https://api.openprimitive.com/v1/${result.domain}`,
          pdfUrl: null,
          year: new Date().getFullYear(),
          issuer: `US Federal (${result.domain || 'Open Primitive'})`,
          issuerType: 'government',
          language: 'en',
          oaStatus: 'open',
          hasFullText: true,
          topics: ['us-federal', result.domain, 'government', 'data'],
          raw: { source: 'open-primitive', domain: result.domain, ...result },
        });
      }
    }

    // Also query specific energy endpoint
    if (sources.length < limit) {
      try {
        const { data: energyData } = await axios.get(`${OPEN_PRIMITIVE_API}/infrastructure/electricity`, {
          params: { state: 'all' },
          headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
          timeout: 10000,
        }).catch(() => ({ data: null }));

        if (energyData?.results ?? energyData?.data) {
          sources.push({
            id: `open-primitive:electricity`,
            provider: 'open-primitive',
            type: 'dataset',
            title: `US Electricity Infrastructure Data (EIA via Open Primitive)`,
            abstract: `US electricity infrastructure data from EIA. State-level generation, consumption, and grid data. Relevant to: ${query}`,
            url: 'https://api.openprimitive.com/v1/infrastructure/electricity',
            pdfUrl: null,
            year: new Date().getFullYear(),
            issuer: 'EIA (via Open Primitive)',
            issuerType: 'government',
            language: 'en',
            oaStatus: 'open',
            hasFullText: true,
            topics: ['electricity', 'us', 'infrastructure', 'energy'],
            raw: { source: 'open-primitive', domain: 'infrastructure/electricity' },
          });
        }
      } catch { /* energy endpoint failure */ }
    }

    console.log(`[OpenPrimitive] Found ${sources.length} datasets`);
  } catch (error: any) {
    console.error(`[OpenPrimitive] Search failed: ${error.message}`);
  }

  return sources;
}
